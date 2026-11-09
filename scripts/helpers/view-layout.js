import { VIEWS } from "../constants/module-constants.js";
import { layoutFor, presetFromSettings } from "./wheel-geometry.js";
import { trackLayout } from "./track-geometry.js";
import { isSideOrientation, wheelRotation } from "./orientation.js";

function isTrackView(view) {
  return VIEWS.includes(view) && view !== "wheel";
}

/**
 * The layout a set of appearance settings draws (RF-90): the wheel from its
 * preset, anchor, portrait shape and gap, or a card view from its size, shape,
 * reach, spacing, anchor and direction.
 */
export function layoutFromSettings(values) {
  if (isTrackView(values.view)) {
    return trackLayout({
      view: values.view,
      size: values.trackSize,
      shape: values.trackShape,
      reach: values.trackReach,
      spacing: values.trackSpacing,
      anchor: values.anchor,
      orientation: values.orientation,
    });
  }
  const preset = presetFromSettings(values);
  return layoutFor(preset, values.anchor, { shape: preset.shape ?? values.portraitShape, gap: values.sliceGap });
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Turns a point of the wheel's drawn "up" pose to the widget's direction. */
function turned({ x, y }, orientation) {
  const angle = toRadians(wheelRotation(orientation));
  return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}

/**
 * Where particles spring from (RF-95), in the widget's own px around its
 * anchor: `{ x, y, width, height }`, x/y being the box centre. "acting" is the
 * acting portrait (the anchor slot, which stays put while the wheel turns);
 * "widget" is everything past the bar: the half disc or the cards.
 */
export function particleBox(layout, orientation, placement = "acting") {
  const side = isSideOrientation(orientation);
  if (layout.view !== "wheel") {
    if (placement === "acting") {
      const pose = layout.poses[layout.offset + layout.HW];
      return { ...pose.center, width: layout.cardWidth * pose.scale, height: layout.cardHeight * pose.scale };
    }
    const center = turned({ x: 0, y: -layout.depth / 2 }, orientation);
    const along = 2 * layout.across;
    return { ...center, width: side ? layout.depth : along, height: side ? along : layout.depth };
  }
  if (placement === "acting") {
    const radius = (layout.R + layout.E + layout.r0) / 2;
    const angle = toRadians(layout.offset * layout.step);
    const center = turned({ x: radius * Math.sin(angle), y: -radius * Math.cos(angle) }, orientation);
    const size = layout.R + layout.E - layout.r0;
    return { ...center, width: size, height: size };
  }
  const center = turned({ x: 0, y: -layout.Rm / 2 }, orientation);
  return { ...center, width: side ? layout.Rm : 2 * layout.Rm, height: side ? 2 * layout.Rm : layout.Rm };
}
