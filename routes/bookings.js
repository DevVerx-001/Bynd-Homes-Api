const express = require('express');
const { body } = require('express-validator');
const { 
  createBooking, 
  confirmBooking, 
  getUserBookings, 
  getBookingById,
  cancelBooking 
} = require('../controllers/bookingController');
const { auth } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const Booking = require('../models/Booking');

const router = express.Router();

// All booking routes require authentication
router.use(auth);

// Validation rules
const bookingValidation = [
  body('propertyId')
    .isMongoId()
    .withMessage('Valid property ID is required'),
  body('checkIn')
    .isISO8601()
    .withMessage('Valid check-in date is required'),
  body('checkOut')
    .isISO8601()
    .withMessage('Valid check-out date is required'),
  body('guests')
    .isInt({ min: 1 })
    .withMessage('At least 1 guest is required')
];
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


// Routes
router.post('/', bookingValidation, handleValidationErrors, createBooking);
router.get('/my-bookings', getUserBookings);
router.get('/:id', getBookingById);
router.post('/:bookingId/confirm', confirmBooking);
router.post('/:bookingId/cancel', cancelBooking);
router.get('/:id/payment-intent-secret', async (req, res) => {
console.log("API hit for payment-intent-secret with id:", req.params.id, "and paymentIntentId:", req.query.paymentIntentId);
  const { paymentIntentId } = req.query;
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status === 'expired' || !paymentIntent.client_secret) {
      // Create a new Payment Intent if expired
      const newPaymentIntent = await stripe.paymentIntents.create({
        amount: 67500, // Amount in cents (e.g., $675)
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.json({ success: true, clientSecret: newPaymentIntent.client_secret });
    } else {
      res.json({ success: true, clientSecret: paymentIntent.client_secret });
    }
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
router.patch('/:id',  async (req, res) => {
  console.log('PATCH request received for booking ID:', req.params.id);
  try {
    const { paymentStatus, stripePaymentIntentId } = req.body;

    // Validate required fields
    if (!paymentStatus || !stripePaymentIntentId) {
      return res.status(400).json({
        success: false,
        message: 'paymentStatus and stripePaymentIntentId are required'
      });
    }

    // Find and update the booking
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { paymentStatus, stripePaymentIntentId },
      { new: true, runValidators: true } // Return the updated document and run schema validators
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.json({
      success: true,
      message: 'Booking updated successfully',
      data: { booking }
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;