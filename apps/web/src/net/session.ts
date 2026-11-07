/** The app-wide connection and React bindings. */
import { useStore } from 'zustand';
import { Connection, type ConnectionState } from './connection';
import { serverUrl } from './config';

let connection: Connection | null = null;

export function getConnection(): Connection {
  connection ??= new Connection({ endpoint: serverUrl() });
  return connection;
}

export function useConnection<T>(selector: (s: ConnectionState) => T): T {
  return useStore(getConnection().store, selector);
}
