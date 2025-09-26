const Property = require('../models/Property');
const Booking = require('../models/Booking');

exports.getProperties = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      city, 
      minPrice, 
      maxPrice, 
      guests,
      checkIn,
      checkOut
    } = req.query;
    
    const filter = { isActive: true };
    
    // Build filter based on query parameters
    if (city) filter['address.city'] = new RegExp(city, 'i');
    if (minPrice || maxPrice) {
      filter.pricePerNight = {};
      if (minPrice) filter.pricePerNight.$gte = parseInt(minPrice);
      if (maxPrice) filter.pricePerNight.$lte = parseInt(maxPrice);
    }
    if (guests) filter.maxGuests = { $gte: parseInt(guests) };

    // If dates are provided, filter out properties that are booked
    if (checkIn && checkOut) {
      const bookedProperties = await Booking.find({
        status: { $in: ['confirmed', 'pending'] },
        $or: [
          { checkIn: { $lt: new Date(checkOut) }, checkOut: { $gt: new Date(checkIn) } }
        ]
      }).distinct('property');

      filter._id = { $nin: bookedProperties };
    }

    const properties = await Property.find(filter)
      .populate('host', 'name email')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Property.countDocuments(filter);

    res.json({
      success: true,
      data: {
        properties,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalProperties: total,
          hasNext: parseInt(page) < Math.ceil(total / parseInt(limit)),
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('Get properties error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching properties'
    });
  }
};

exports.getPropertyById = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id)
      .populate('host', 'name email phone');
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    if (!property.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Property is not available'
      });
    }

    res.json({
      success: true,
      data: { property }
    });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching property'
    });
  }
};

exports.getPropertyAvailability = async (req, res) => {
  try {
    const { propertyId } = req.params;
    const { checkIn, checkOut } = req.query;

    if (!checkIn || !checkOut) {
      return res.status(400).json({
        success: false,
        message: 'Both checkIn and checkOut dates are required'
      });
    }

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

    const isAvailable = await Booking.checkAvailability(propertyId, checkIn, checkOut);

    res.json({
      success: true,
      data: {
        available: isAvailable,
        checkIn,
        checkOut,
        propertyId
      }
    })
    
    
    ;
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking availability'
    });
  }
};
exports.createProperty = async (req, res) => {
  try {
    const {
      title,
      description,
      images,
      pricePerNight,
      maxGuests,
      bedrooms,
      bathrooms,
      amenities,
      address
    } = req.body;

    // Create new property
    const property = new Property({
      title: title.trim(),
      description: description.trim(),
      images: images || [],
      pricePerNight: parseFloat(pricePerNight),
      maxGuests: parseInt(maxGuests),
      bedrooms: parseInt(bedrooms),
      bathrooms: parseFloat(bathrooms),
      amenities: amenities || [],
      address: {
        street: address.street.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        country: address.country.trim(),
        zipCode: address.zipCode.trim()
      },
      host: req.user._id // Set the authenticated user as the host
    });

    await property.save();
    
    // Populate host details for response
    await property.populate('host', 'name email phone');

    res.status(201).json({
      success: true,
      message: 'Property created successfully',
      data: { property }
    });
  } catch (error) {
    console.error('Create property error:', error);
    
    // Handle duplicate key errors (if any)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Property with similar details already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating property',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};