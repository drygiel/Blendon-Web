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
  /** Blendon's menu is in the toolbar; false shows the Editor's Pivot / Center. */
  blendon(): boolean;
}
