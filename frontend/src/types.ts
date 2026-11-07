export interface Series {
  id: number; name: string; minValue: number; maxValue: number; color: string; icon: string | null; unit: string | null;
}
export interface Measurement { id: number; seriesId: number; sensorId: number | null; value: number; timestamp: string }
export interface Sensor { id: number; name: string; seriesId: number; createdAt: string; lastMeasurementAt: string | null }
export interface Rejection {
  id: number; seriesId: number; seriesName: string; sensorId: number | null; sensorName: string | null;
  value: number; timestamp: string | null; reason: string; createdAt: string;
}
export interface FieldError { field: string; message: string }
