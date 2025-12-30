import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'deployments',
})
export class DeploymentsGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribeToDeployment')
  handleSubscribe(client: Socket, payload: { deploymentId: number }) {
    const room = `deployment-${payload.deploymentId}`;
    client.join(room);
    console.log(`Client ${client.id} joined room ${room}`);
    return { event: 'joined', room };
  }

  sendLog(deploymentId: number, log: string) {
    this.server.to(`deployment-${deploymentId}`).emit('log', { log });
  }

  sendStatusUpdate(deploymentId: number, status: string) {
    this.server.to(`deployment-${deploymentId}`).emit('status', { status });
  }
}
