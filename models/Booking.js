const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  checkIn: {
    type: Date,
    required: true
  },
  checkOut: {
    type: Date,
    required: true
  },
  guests: {
    type: Number,
    required: true,
    min: 1
  },
  totalAmount: {
    type: Number,
    required: true
  },
  stripePaymentIntentId: {
    type: String,
    sparse: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Compound index to prevent double bookings
bookingSchema.index({ 
  property: 1, 
  checkIn: 1, 
  checkOut: 1,
  status: 1 
});

// Index for user bookings
bookingSchema.index({ user: 1, createdAt: -1 });

// Static method to check availability
bookingSchema.statics.checkAvailability = async function(propertyId, checkIn, checkOut, excludeBookingId = null) {
  const query = {
    property: propertyId,
    status: { $in: ['confirmed', 'pending'] }, // Only consider active bookings
    $or: [
      // Existing booking starts before requested checkout AND ends after requested checkin
      { checkIn: { $lt: new Date(checkOut) }, checkOut: { $gt: new Date(checkIn) } }
    ]
  };

  if (excludeBookingId) {
    query._id = { $ne: excludeBookingId };
  }

  const conflictingBooking = await this.findOne(query);
  return !conflictingBooking;
};

// Virtual for number of nights
bookingSchema.virtual('nights').get(function() {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((this.checkOut - this.checkIn) / oneDay));
});

// Ensure virtual fields are serialized
bookingSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Booking', bookingSchema);