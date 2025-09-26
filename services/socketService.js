const socketIO = require('socket.io');
const Notification = require('../models/Notification');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId mapping
  }

  initialize(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    this.io.on('connection', (socket) => {
      console.log('🔌 User connected:', socket.id);

      // User authentication and room joining
      socket.on('authenticate', (userId) => {
        this.connectedUsers.set(userId, socket.id);
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined room user_${userId}`);
      });

      // Mark notification as read
      socket.on('mark_notification_read', async (notificationId) => {
        try {
          await Notification.findByIdAndUpdate(notificationId, { isRead: true });
          socket.emit('notification_updated', { notificationId, isRead: true });
        } catch (error) {
          console.error('Error marking notification as read:', error);
        }
      });

      // Get unread notifications count
      socket.on('get_unread_count', async (userId) => {
        try {
          const count = await Notification.countDocuments({ 
            user: userId, 
            isRead: false 
          });
          socket.emit('unread_count', count);
        } catch (error) {
          console.error('Error getting unread count:', error);
        }
      });

      socket.on('disconnect', () => {
        // Remove user from connected users
        for (let [userId, socketId] of this.connectedUsers.entries()) {
          if (socketId === socket.id) {
            this.connectedUsers.delete(userId);
            break;
          }
        }
        console.log('🔌 User disconnected:', socket.id);
      });
    });

    return this.io;
  }

  // Send notification to specific user
  async sendToUser(userId, event, data) {
    if (this.connectedUsers.has(userId)) {
      const socketId = this.connectedUsers.get(userId);
      this.io.to(socketId).emit(event, data);
    }
    
    // Also emit to room for reliability
    this.io.to(`user_${userId}`).emit(event, data);
  }

  // Broadcast to all connected users (admin notifications)
  broadcast(event, data) {
    this.io.emit(event, data);
  }
}

module.exports = new SocketService();