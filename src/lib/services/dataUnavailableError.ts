/**
 * Raised when a required upstream market-data source has nothing usable to offer
 * (as opposed to an unexpected bug). API routes map this to HTTP 503.
 */
export class DataUnavailableError extends Error {
  public readonly notes: string[];

  constructor(message: string, notes: string[] = []) {
    super(message);
    this.name = "DataUnavailableError";
    this.notes = notes;
  }
}
