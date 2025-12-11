export enum TransferState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  WAITING_APPROVAL = 'WAITING_APPROVAL',
  TRANSFERRING = 'TRANSFERRING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface DataPacket {
  type: 'handshake' | 'approve' | 'reject' | 'file-meta' | 'file-chunk' | 'file-end' | 'file-whole';
  payload?: any;
}

export interface QueuedFile {
  file: File;
  previewUrl?: string;
}