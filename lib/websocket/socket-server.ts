import { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from '../auth/jwt';
import { getTenantDatabase } from '../database/connection';

interface SocketData {
  userId: string;
  tenantId: string;
  role: string;
}

export function initializeSocket(httpServer: any) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.NEXTAUTH_URL 
        : 'http://localhost:3000',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const payload = verifyToken(token);
      if (!payload) {
        return next(new Error('Invalid authentication token'));
      }

      socket.data = {
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role
      } as SocketData;

      // Join tenant-specific room
      socket.join(`tenant_${payload.tenantId}`);
      
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const socketData = socket.data as SocketData;
    console.log(`User ${socketData.userId} connected to tenant ${socketData.tenantId}`);

    // Join role-specific rooms
    socket.join(`role_${socketData.role}`);

    // Handle dashboard updates
    socket.on('dashboard:update', async (data) => {
      try {
        const db = await getTenantDatabase(socketData.tenantId);
        
        // Update dashboard configuration
        await db.collection('dashboards').updateOne(
          { userId: socketData.userId },
          { 
            $set: { 
              layout: data.layout, 
              widgets: data.widgets,
              updatedAt: new Date()
            } 
          },
          { upsert: true }
        );

        // Broadcast to tenant room
        socket.to(`tenant_${socketData.tenantId}`).emit('dashboard:updated', {
          userId: socketData.userId,
          layout: data.layout
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to update dashboard' });
      }
    });

    // Handle real-time notifications
    socket.on('notification:send', (data) => {
      if (socketData.role === 'admin' || socketData.role === 'super_admin') {
        io.to(`tenant_${socketData.tenantId}`).emit('notification:received', {
          id: Date.now().toString(),
          title: data.title,
          message: data.message,
          type: data.type || 'info',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle security alerts
    socket.on('security:alert', (data) => {
      if (socketData.role === 'super_admin') {
        io.to('role_admin').to('role_super_admin').emit('security:alert', {
          ...data,
          timestamp: new Date().toISOString(),
          tenantId: socketData.tenantId
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${socketData.userId} disconnected`);
    });
  });

  return io;
}

export function broadcastToTenant(io: SocketIOServer, tenantId: string, event: string, data: any) {
  io.to(`tenant_${tenantId}`).emit(event, data);
}

export function broadcastToRole(io: SocketIOServer, role: string, event: string, data: any) {
  io.to(`role_${role}`).emit(event, data);
}