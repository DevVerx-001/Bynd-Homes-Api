const Booking = require('../models/Booking');
const Property = require('../models/Property');
const stripeService = require('../services/stripeService');
const guestyService = require('../services/guestyService');
const moment = require('moment');
const notificationService = require('../services/notificationService');

exports.createBooking = async (req, res) => {
  try {
    const { propertyId, checkIn, checkOut, guests } = req.body;
    const userId = req.user._id;

    // Validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    if (checkInDate >= checkOutDate) {
      return res.status(400).json({
        success: false,
        message: 'Check-out date must be after check-in date'
      });
    }

    if (checkInDate < new Date().setHours(0, 0, 0, 0)) {
      return res.status(400).json({
        success: false,
        message: 'Check-in date cannot be in the past'
      });
    }

    // Get property
    const property = await Property.findById(propertyId);
    if (!property || !property.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or not available'
      });
    }

    // Check guest count
    if (guests > property.maxGuests) {
      return res.status(400).json({ 
        success: false,
        message: `Maximum guests allowed: ${property.maxGuests}` 
      });
    }

    // Check availability
    const isAvailable = await Booking.checkAvailability(propertyId, checkIn, checkOut);
    if (!isAvailable) {
      return res.status(400).json({ 
        success: false,
        message: 'Property not available for selected dates' 
      });
    }

    // Calculate total amount
    const nights = moment(checkOut).diff(moment(checkIn), 'days');
    const totalAmount = property.pricePerNight * nights;

    // Create booking
    const booking = new Booking({
      property: propertyId,
      user: userId,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests,
      totalAmount
    });

    await booking.save();

    // Create Stripe Payment Intent
    const paymentResult = await stripeService.createPaymentIntent(totalAmount, 'usd', {
      bookingId: booking._id.toString(),
      propertyId: propertyId,
      userId: userId.toString()
    });

    if (!paymentResult.success) {
      // Delete booking if payment intent creation fails
      await Booking.findByIdAndDelete(booking._id);
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment intent',
        error: paymentResult.error
      });
    }

    // Update booking with payment intent ID
    booking.stripePaymentIntentId = paymentResult.paymentIntentId;
    await booking.save();

    // Populate booking details for response
    await booking.populate('property', 'title images address pricePerNight');

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: {
        booking,
        payment: {
          clientSecret: paymentResult.clientSecret,
          paymentIntentId: paymentResult.paymentIntentId,
          amount: paymentResult.amount
        }
      }
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.confirmBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const booking = await Booking.findById(bookingId)
      .populate('property', 'title images address pricePerNight maxGuests')
      .populate('user', 'name email phone');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify user owns the booking
    if (booking.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only confirm your own bookings.'
      });
    }

    // Check if booking is already confirmed
    if (booking.status === 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already confirmed'
      });
    }

    // 🔥 **FIX: Check database paymentStatus first**
    if (booking.paymentStatus === 'succeeded' || booking.paymentStatus === 'paid') {
      console.log('Payment already succeeded in database, confirming booking...');
      
      // Double-check availability
      const isStillAvailable = await Booking.checkAvailability(
        booking.property._id.toString(), 
        booking.checkIn, 
        booking.checkOut,
        bookingId
      );

      if (!isStillAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Property is no longer available for the selected dates.'
        });
      }

      // Update booking status to confirmed
      booking.status = 'confirmed';
      booking.paymentStatus = 'paid'; // Ensure consistent status
      await booking.save();

      try {
        const notification = await notificationService.createBookingConfirmation(booking);
        await notificationService.sendEmailNotification(notification, booking).catch(emailError => {
          console.error('Email notification failed:', emailError);
        });
        console.log('✅ Booking confirmation notification created');
      } catch (notificationError) {
        console.error('Notification creation failed:', notificationError);
      }

      return res.json({
        success: true,
        message: 'Booking confirmed successfully',
        data: {
          booking
        }
      });
    }

    const guestyResult = await guestyService.createBooking({
      _id: booking._id,
      property: {
        _id: booking.property._id,
        guestyId: booking.property.guestyId,
        title: booking.property.title
      },
      user: {
        name: booking.user.name,
        email: booking.user.email,
        phone: booking.user.phone
      },
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guests: booking.guests,
      totalAmount: booking.totalAmount
    });

    if (guestyResult.success) {
      booking.guestyBookingId = guestyResult.booking.id;
      await booking.save();
      
      console.log('✅ Booking synced to Guesty:', guestyResult.booking.id);
    }

    // 🔥 **FIX: For development, also check if we should auto-confirm**
    if (process.env.NODE_ENV === 'development') {
      console.log('Development mode: Checking payment status...');
      
      const paymentResult = await stripeService.retrievePaymentIntent(booking.stripePaymentIntentId);
      
      if (paymentResult.success) {
        const allowedStatuses = ['succeeded', 'processing', 'requires_capture'];
        if (allowedStatuses.includes(paymentResult.paymentIntent.status)) {
          console.log('Development: Allowing payment status:', paymentResult.paymentIntent.status);
          
          const isStillAvailable = await Booking.checkAvailability(
            booking.property._id.toString(), 
            booking.checkIn, 
            booking.checkOut,
            bookingId
          );

          if (!isStillAvailable) {
            return res.status(400).json({
              success: false,
              message: 'Property is no longer available.'
            });
          }

          booking.status = 'confirmed';
          booking.paymentStatus = 'paid';
          await booking.save();

          await Booking.findByIdAndUpdate(bookingId, {
            paymentStatus: 'paid'
          });

          try {
            const notification = await notificationService.createBookingConfirmation(booking);
            await notificationService.sendEmailNotification(notification, booking).catch(emailError => {
              console.error('Email notification failed:', emailError);
            });
            console.log('✅ Booking confirmation notification created');
          } catch (notificationError) {
            console.error('Notification creation failed:', notificationError);
          }

          return res.json({
            success: true,
            message: `Booking confirmed (development - status: ${paymentResult.paymentIntent.status})`,
            data: { booking }
          });
        }
      }
    }

    // Original production logic (strict check)
    const paymentResult = await stripeService.retrievePaymentIntent(booking.stripePaymentIntentId);
    
    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to retrieve payment information'
      });
    }

    if (paymentResult.paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: `Payment not completed. Current status: ${paymentResult.paymentIntent.status}`
      });
    }

    // Double-check availability
    const isStillAvailable = await Booking.checkAvailability(
      booking.property._id.toString(), 
      booking.checkIn, 
      booking.checkOut,
      bookingId
    );

    if (!isStillAvailable) {
      return res.status(400).json({
        success: false,
        message: 'Property is no longer available for the selected dates. Payment will be refunded.'
      });
    }

    // Update booking status
    booking.status = 'confirmed';
    booking.paymentStatus = 'paid';
    await booking.save();

    try {
      const notification = await notificationService.createBookingConfirmation(booking);
      await notificationService.sendEmailNotification(notification, booking).catch(emailError => {
        console.error('Email notification failed:', emailError);
      });
      console.log('✅ Booking confirmation notification created');
    } catch (notificationError) {
      console.error('Notification creation failed:', notificationError);
    }

    res.json({
      success: true,
      message: 'Booking confirmed successfully',
      data: {
        booking
      }
    });
  } catch (error) {
    console.error('Confirm booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while confirming booking'
    });
  }
};

exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10, status } = req.query;

    const filter = { user: userId };
    if (status) filter.status = status;

    const bookings = await Booking.find(filter)
      .populate('property', 'title images address pricePerNight')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Booking.countDocuments(filter);

    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalBookings: total
        }
      }
    });
  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching bookings'
    });
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('property', 'title images address pricePerNight maxGuests')
      .populate('user', 'name email phone');
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify user owns the booking
    if (booking.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own bookings.'
      });
    }

    res.json({
      success: true,
      data: { booking }
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching booking'
    });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Verify user owns the booking
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only cancel your own bookings.'
      });
    }

    // Check if cancellation is allowed (not within 24 hours of check-in)
    const hoursToCheckIn = moment(booking.checkIn).diff(moment(), 'hours');
    if (hoursToCheckIn < 24 && booking.status === 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Cancellation not allowed within 24 hours of check-in'
      });
    }

    // Cannot cancel completed or already cancelled bookings
    if (['cancelled', 'completed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: `Booking is already ${booking.status}`
      });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while cancelling booking'
    });
  }
};