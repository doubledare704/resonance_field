import type { FieldLayout } from '../../shared/field-layout';
import { pointInCircle, pointInRect } from '../../shared/field-layout';

export const isValidDeployPosition = (layout: FieldLayout, x: number, y: number): boolean => {
  if (!pointInRect(x, y, layout.bounds)) {
    return false;
  }

  for (const obstacle of layout.obstacles) {
    if (pointInRect(x, y, obstacle)) {
      return false;
    }
  }

  for (const hazard of layout.hazards) {
    if (pointInCircle(x, y, hazard)) {
      return false;
    }
  }

  if (pointInCircle(x, y, layout.sink)) {
    return false;
  }

  return true;
};
