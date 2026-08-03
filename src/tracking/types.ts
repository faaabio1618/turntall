export interface Point {
  x: number;
  y: number;
}

export interface SubjectBox extends Point {
  width: number;
  height: number;
}

export interface CropSize {
  width: number;
  height: number;
}

export interface SubjectReference {
  id?: number | string;
  time: number;
  box: SubjectBox;
  jump?: boolean;
  automatic?: boolean;
  cropLeft?: number;
  cropLocked?: boolean;
  confidence?: number;
  sampleIndex?: number;
  stabilized?: boolean;
}

export interface CropPoint {
  time: number;
  left: number;
  top: number;
  jump?: boolean;
  automatic?: boolean;
  cropLocked?: boolean;
  minimumLeft?: number;
  maximumLeft?: number;
  sampleIndex?: number;
}

export interface PixelBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PixelFrame {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface TrackingTemplate {
  values: Float32Array;
  mean: number;
  deviation: number;
  columns: number;
  rows: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface TrackingResult {
  box: SubjectBox;
  confidence: number;
  error?: number;
  points?: number;
  tracker?: "automatic" | "large" | "smooth";
}

export interface TrackingConfidencePoint {
  time: number;
  confidence: number;
  manual?: boolean;
}
