export interface JoinDocumentMessage {
  type: "join-document";
  documentId: string;
}

export interface LeaveDocumentMessage {
  type: "leave-document";
  documentId: string;
}

/** Every message shape a client is allowed to send. */
export type ClientMessage = JoinDocumentMessage | LeaveDocumentMessage;

export interface JoinedMessage {
  type: "joined";
  documentId: string;
}

export interface ErrorMessage {
  type: "error";
  message: string;
}

export interface PresenceUser {
  id: string;
  username: string;
  color: string;
}

/** Every message shape the server is allowed to send back. */
export type ServerMessage = JoinedMessage | ErrorMessage | PresenceUser;