// A read-only view of the existing save. Never loads HotelState or starts its engine.
export function readResortSnapshot() {
  const hotel = CasinoSaveSafety.inspectKey('hotelGameState');
  if (!hotel.valid) throw new Error(hotel.error);
  return {
    hasHotel: hotel.present,
    name: hotel.value?.meta?.hotelName || 'Your resort',
    hotelCash: hotel.value?.currencies.hotelCash ?? null,
  };
}
