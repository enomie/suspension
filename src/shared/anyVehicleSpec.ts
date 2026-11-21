import type { VehicleSpec } from './vehicleSpec';
import type { TrackedVehicleSpec } from './trackedSpec';
import type { BikeVehicleSpec } from './bikeSpec';

/** Any vehicle description: wheeled (`type` missing or 'wheeled'), tracked or bike */
export type AnyVehicleSpec = VehicleSpec | TrackedVehicleSpec | BikeVehicleSpec;
