export type FlightStatus =
  | "scheduled"
  | "departed"
  | "en_route"
  | "approaching"
  | "arrived"
  | "delayed"
  | "diverted"
  | "cancelled"
  | "unknown";

export type FlightLookup = {
  /** Normalized IATA flight code, e.g. "LH1234" — uppercased, no whitespace. */
  iata: string;
  /** Same as `iata` for our purposes; preserved separately because the DB column is the canonical flight number. */
  flightNumber: string;
  /** ICAO airport code of departure (falls back to IATA if ICAO is missing). */
  origin: string;
  /** ICAO airport code of arrival. */
  destination: string;
  scheduledDepAt: Date;
  scheduledArrAt: Date;
  actualDepAt: Date | null;
  actualArrAt: Date | null;
  status: FlightStatus;
};
