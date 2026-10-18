// Blendon's pivot-point modes as the toolbar dropdown names them (SelectionPivot.cs).

/** BoundingBoxCenter, Median, IndividualOrigins, ActiveObject - the C# enum order. */
export const pivotPointNames = [
  { short: 'Center', long: 'Center (Bounding Box)' },
  { short: 'Median', long: 'Median Point' },
  { short: 'Pivot', long: 'Pivot (Individual Origins)' },
  { short: 'Active', long: 'Active Object' },
];

export interface PivotPointApi {
  get(): number;
  set(mode: number): void;
  /** Blendon's tools offer all four modes; false leaves their dropdown Center and Pivot only. */
  blendon(): boolean;
}
