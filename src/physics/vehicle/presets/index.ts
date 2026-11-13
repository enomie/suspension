import type { VehicleSpec } from '../types';
import { car, makeCar } from './car';

/** Taste 1…9, 0 → Aufhängungsprinzip (gleicher Testträger). */
export const PRESETS: VehicleSpec[] = [
  car, //                                                                          1
  makeCar('wishbone', 'Doppelquerlenker', 'doubleWishbone'), //                    2
  makeCar('macpherson', 'McPherson', 'macPherson'), //                             3
  makeCar('trailing', 'Längslenker (hinten)', 'trailingArm'), //                   4
  makeCar('semitrailing', 'Schräglenker (hinten)', 'semiTrailingArm'), //          5
  makeCar('swing', 'Pendelachse', 'swingAxle'), //                                 6
  makeCar('solid', 'Starrachse', 'solidAxle'), //                                  7
  makeCar('twist', 'Verbundlenker (hinten)', 'twistBeam'), //                      8
  makeCar('multilink', 'Mehrlenker', 'multiLink'), //                              9
  makeCar('bogie', 'Tandem-Pendel (hinten)', 'bogie'), //                          0
];
