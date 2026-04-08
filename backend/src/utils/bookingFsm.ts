export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'arriving'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

const NEXT_BY_STATUS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['arriving', 'cancelled'],
  arriving: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['cancelled'],
  cancelled: [],
  disputed: ['cancelled'],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (to === 'cancelled' && from !== 'cancelled') return true;
  return NEXT_BY_STATUS[from].includes(to);
}

export function transitionTimestampColumn(next: BookingStatus): string | null {
  switch (next) {
    case 'accepted':
      return 'accepted_at';
    case 'arriving':
      return 'arriving_at';
    case 'in_progress':
      return 'started_at';
    case 'completed':
      return 'completed_at';
    case 'cancelled':
      return 'cancelled_at';
    default:
      return null;
  }
}
