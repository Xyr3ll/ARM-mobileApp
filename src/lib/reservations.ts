import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ReservationPayload = {
  roomName: string;
  roomType: 'lecture' | 'laboratory' | 'all';
  dateLabel: string;
  dateISO?: string;
  timeSlot: string;
  notes: string;
  requesterName?: string | null; 
  status?: 'pending' | 'approved' | 'declined';
};

/**
 * Create a reservation document in Firestore under 'reservations'.
 * Adds createdAt/updatedAt via serverTimestamp and defaults status to 'pending'.
 */
export async function createReservation(payload: ReservationPayload) {
  const data = {
    roomName: payload.roomName,
    roomType: payload.roomType,
    dateLabel: payload.dateLabel,
    dateISO: payload.dateISO ?? null,
    timeSlot: payload.timeSlot,
    notes: payload.notes,
    requesterName: payload.requesterName ?? null,
    status: payload.status ?? 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'reservations'), data);
  return ref.id;
}
