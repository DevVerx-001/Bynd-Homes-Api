const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class StripeService {
  async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount / 100 // Convert back to dollars
      };
    } catch (error) {
      console.error('Stripe payment intent creation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async retrievePaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return {
        success: true,
        paymentIntent
      };
    } catch (error) {
      console.error('Stripe payment intent retrieval error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleWebhook(payload, signature) {
    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      return { success: true, event };
    } catch (error) {
      console.error('Stripe webhook error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new StripeService();