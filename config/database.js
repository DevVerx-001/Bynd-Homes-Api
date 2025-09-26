const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check if MONGODB_URI is provided
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }

    // Connection options for better reliability
    const options = {
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    
    // Provide specific guidance based on error type
    if (error.message.includes('IP')) {
      console.error('\n🔧 IP Whitelist Issue Detected:');
      console.error('1. Go to MongoDB Atlas Dashboard');
      console.error('2. Navigate to Network Access');
      console.error('3. Add your current IP address or use 0.0.0.0/0 for development');
      console.error('4. Current IP: Run "curl -s https://api.ipify.org" to get your IP');
    } else if (error.message.includes('authentication')) {
      console.error('\n🔧 Authentication Issue Detected:');
      console.error('1. Check your MongoDB Atlas username and password');
      console.error('2. Verify your MONGODB_URI connection string');
    } else if (error.message.includes('MONGODB_URI')) {
      console.error('\n🔧 Environment Variable Issue:');
      console.error('1. Create a .env file in your project root');
      console.error('2. Add MONGODB_URI=your-connection-string');
      console.error('3. Make sure to restart your server after adding the .env file');
    }
    
    process.exit(1);
  }
};

module.exports = connectDB;
