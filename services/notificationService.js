const axios = require('axios');
const Notification = require('../models/Notification');

class NotificationService {
  async sendEmailNotification(notification, booking = null) {
    try {
      const serviceID = process.env.EMAILJS_SERVICE_ID;
      const templateID = process.env.EMAILJS_TEMPLATE_ID;
      const userID = process.env.EMAILJS_PUBLIC_KEY;

      console.log('🔧 Using:', { serviceID, templateID, userID });

      // Use booking.user if provided, otherwise fall back to notification.user
      const user = booking?.user || notification.user;
      const toEmail = user?.email || 'default@example.com'; // Fallback email
      const toName = user?.name || 'Unknown User'; // Fallback name
      console.log('📧 Sending email to:', toEmail, 'Name:', toName);

      const templateParams = {
        to_email: toEmail,
        to_name: toName,
        subject: notification.title,
        message: notification.message,
        property_title: notification.metadata?.get('propertyTitle'),
        check_in: this.formatDate(notification.metadata?.get('checkIn')),
        check_out: this.formatDate(notification.metadata?.get('checkOut')),
        guests: notification.metadata?.get('guests'),
        total_amount: notification.metadata?.get('totalAmount'),
        booking_id: notification.metadata?.get('bookingId')
      };

      console.log('📧 Template params:', templateParams);

      const response = await axios.post(
        'https://api.emailjs.com/api/v1.0/email/send',
        {
          service_id: serviceID,
          template_id: templateID,
          user_id: userID,
          template_params: templateParams
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      console.log('✅ Email sent successfully! Status:', response.status);
      return true;

    } catch (error) {
      console.error('❌ EmailJS error details:');
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
        console.error('Headers:', error.response.headers);
      } else {
        console.error('Error message:', error.message);
      }
      // Removed mock email fallback for now to focus on the issue
      return false;
    }
  }

  // Helper function to format dates
  formatDate(dateString) {
    if (!dateString) return 'Not specified';
    
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid date';
    }
  }

  async createBookingConfirmation(booking) {
    try {
      const title = 'Booking Confirmed! 🎉';
      const message = `Your booking for "${booking.property.title}" from ${this.formatDate(booking.checkIn)} to ${this.formatDate(booking.checkOut)} has been confirmed.`;

      const notification = new Notification({
        user: booking.user._id || booking.user,
        booking: booking._id,
        type: 'booking_confirmed',
        title,
        message,
        metadata: {
          bookingId: booking._id.toString(),
          propertyTitle: booking.property.title,
          checkIn: booking.checkIn.toISOString(),
          checkOut: booking.checkOut.toISOString(),
          totalAmount: booking.totalAmount.toString(),
          guests: booking.guests.toString()
        }
      });

      await notification.save();
      await notification.populate('user', 'name email');
      
      // Send email notification using the booking object
      await this.sendEmailNotification(notification, booking);

      console.log('✅ Booking confirmation notification created:', notification._id);
      return notification;
    } catch (error) {
      console.error('Error creating booking confirmation notification:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();