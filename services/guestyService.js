class GuestyService {
  constructor() {
    // Mock data storage
    this.mockListings = new Map();
    this.mockBookings = new Map();
  }

  // Mock: Sync property to Guesty
  async createListing(propertyData) {
    const listingId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const mockListing = {
      id: listingId,
      title: propertyData.title,
      externalId: propertyData._id,
      status: 'active',
      createdAt: new Date().toISOString(),
      ...propertyData
    };

    this.mockListings.set(listingId, mockListing);
    
    console.log('📦 Mock Guesty: Listing created', listingId);
    return { success: true, listing: mockListing };
  }

  // Mock: Check availability
  async checkAvailability(listingId, checkIn, checkOut) {
  try {
    // Simulate API delay (real API would take time)
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Convert to Date objects for comparison
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    // Get all bookings for this listing
    const conflictingBookings = Array.from(this.mockBookings.values()).filter(booking => 
      booking.listingId === listingId &&
      booking.status === 'confirmed' &&
      this.datesOverlap(booking.checkIn, booking.checkOut, checkInDate, checkOutDate)
    );

    const isAvailable = conflictingBookings.length === 0;
    
    console.log('📅 Mock Guesty: Availability check', { 
      listingId, 
      checkIn: checkInDate.toISOString(), 
      checkOut: checkOutDate.toISOString(), 
      isAvailable,
      conflictingBookings: conflictingBookings.length
    });
    
    return { 
      success: true, 
      available: isAvailable,
      conflictingBookings: conflictingBookings.map(b => ({
        id: b.id,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        guestName: b.guestName
      })),
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Mock Guesty availability error:', error);
    return { 
      success: false, 
      error: error.message,
      available: true // Fallback to available if check fails
    };
  }
}

  // Mock: Create booking in Guesty
  async createBooking(bookingData) {
    const guetsyBookingId = `guest_booking_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const mockBooking = {
      id: guetsyBookingId,
      listingId: bookingData.property.guestyId || bookingData.property._id,
      externalBookingId: bookingData._id,
      guestName: bookingData.user.name,
      guestEmail: bookingData.user.email,
      checkIn: bookingData.checkIn,
      checkOut: bookingData.checkOut,
      guests: bookingData.guests,
      status: 'confirmed',
      totalAmount: bookingData.totalAmount,
      createdAt: new Date().toISOString()
    };

    this.mockBookings.set(guetsyBookingId, mockBooking);
    
    console.log('🎯 Mock Guesty: Booking synced', guetsyBookingId);
    return { success: true, booking: mockBooking };
  }

  // Mock: Update booking status
  async updateBookingStatus(guestyBookingId, status) {
    const booking = this.mockBookings.get(guestyBookingId);
    if (booking) {
      booking.status = status;
      booking.updatedAt = new Date().toISOString();
      console.log('🔄 Mock Guesty: Booking status updated', { guestyBookingId, status });
      return { success: true, booking };
    }
    return { success: false, error: 'Booking not found' };
  }

  // Mock: Get listing details
  async getListing(listingId) {
    const listing = this.mockListings.get(listingId);
    if (listing) {
      return { success: true, listing };
    }
    return { success: false, error: 'Listing not found' };
  }

  // Helper: Check date overlap
  datesOverlap(start1, end1, start2, end2) {
    const d1 = new Date(start1);
    const d2 = new Date(end1);
    const d3 = new Date(start2);
    const d4 = new Date(end2);
    return (d1 < d4) && (d2 > d3);
  }

  // Mock: Get all mock data (for debugging)
  getMockData() {
    return {
      listings: Array.from(this.mockListings.values()),
      bookings: Array.from(this.mockBookings.values())
    };
  }
}

module.exports = new GuestyService();