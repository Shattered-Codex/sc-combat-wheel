import assert from "node:assert/strict";
import { describe, it } from "node:test";
import WheelAppearance from "../scripts/applications/WheelAppearance.js";
import { trackLayout } from "../scripts/helpers/track-geometry.js";

function node(classes = [], children = []) {
  const values = new Map();
  return {
    children,
    classList: { contains: (name) => classes.includes(name) },
    style: {
      setProperty: (name, value) => values.set(name, value),
      removeProperty: (name) => values.delete(name),
      getPropertyValue: (name) => values.get(name) ?? "",
    },
  };
}

function controls({ side = false, compact = false, buttonSize = "auto", width = 28, height = 28, main = 4, tools = 8 } = {}) {
  const pods = ["start", "end"].map((edge) => {
    const primary = node(["scw-pod-main"], Array.from({ length: main }, () => node()));
    const more = node(["scw-pod-more"], [node(["scw-tools"], [...Array.from({ length: tools }, () => node()), node(["scw-bar-rule"])])]);
    const pod = node(["scw-pod", `scw-pod--${edge}`], [primary, more]);
    pod.querySelectorAll = (selector) => selector.includes("scw-pod-main") ? [primary, more] : [more];
    // Include the fitted minimum so a failure to clear it prevents shrinking.
    Object.defineProperties(pod, {
      offsetWidth: { get: () => Math.max(90, parseFloat(pod.style.getPropertyValue("--scw-pod-w")) || 0) },
      offsetHeight: { get: () => Math.max(40, parseFloat(pod.style.getPropertyValue("--scw-pod-h")) || 0) },
    });
    return pod;
  });
  const root = node();
  root.querySelectorAll = () => pods;
  const look = { barSize: compact ? "compact" : "normal", barButtonSize: buttonSize, barButtonWidth: width, barButtonHeight: height };
  const fit = (layout) => WheelAppearance.fitPods(root, layout, look, side ? "right" : "up");
  return { root, pods, fit };
}

describe("split Slider controls", () => {
  it("fits each edge independently, wrapping both primary actions and tools", () => {
    const { root, pods, fit } = controls();
    const layout = trackLayout({ view: "slider", shape: "tall", anchor: "left", reach: 3 });
    const reach = fit(layout);
    assert.equal(reach, 96, "measured width plus the gap, including multiple columns");
    assert.equal(root.style.getPropertyValue("--scw-pod-end-reach"), "96px", "the end-position phase strip clears the actual controls");
    for (const [index, edge] of ["start", "end"].entries()) {
      const pod = pods[index];
      assert.equal(pod.style.getPropertyValue("--scw-pod-h"), `${Math.ceil(layout.edgeDepths[edge])}px`);
      const rows = Number(pod.children[0].style.getPropertyValue("--scw-pod-cells"));
      assert.ok(rows >= 1 && rows < 4, "main actions reflow before exceeding the edge depth");
      assert.equal(Number(pod.children[1].style.getPropertyValue("--scw-pod-cells")), rows);
    }
    assert.notEqual(pods[0].style.getPropertyValue("--scw-pod-h"), pods[1].style.getPropertyValue("--scw-pod-h"));
  });

  it("shrinks on repeated fits, and sizes side rails across their width", () => {
    const { root, pods, fit } = controls({ side: true, compact: true });
    const large = trackLayout({ view: "slider", size: "large", orientation: "right", reach: 2 });
    const small = trackLayout({ view: "slider", size: "small", orientation: "right", reach: 6 });
    fit(large);
    const before = Number.parseFloat(pods[0].style.getPropertyValue("--scw-pod-w"));
    assert.equal(fit(small), 46, "uses outward height for a side rail");
    assert.equal(root.style.getPropertyValue("--scw-pod-end-reach"), "46px");
    assert.ok(Number.parseFloat(pods[0].style.getPropertyValue("--scw-pod-w")) < before);
    assert.equal(pods[0].style.getPropertyValue("--scw-pod-h"), "");
    assert.equal(pods[0].children[0].style.getPropertyValue("--scw-pod-cells"), "1");
  });

  it("uses compact targets to fit more controls without scaling the panel", () => {
    const layout = trackLayout({ view: "slider", size: "medium", shape: "tall", reach: 3 });
    const normal = controls();
    const compact = controls({ compact: true });
    normal.fit(layout);
    compact.fit(layout);
    const rows = (state) => Number(state.pods[0].children[0].style.getPropertyValue("--scw-pod-cells"));
    assert.ok(rows(compact) > rows(normal));
  });

  it("packs an explicit button size independently of the bar size", () => {
    const layout = trackLayout({ view: "slider", size: "large", shape: "tall", reach: 2 });
    const small = controls({ buttonSize: "compact" });
    const large = controls({ compact: true, buttonSize: "large" });
    small.fit(layout);
    large.fit(layout);
    assert.equal(small.pods[0].children[0].style.getPropertyValue("--scw-pod-cells"), "3");
    assert.equal(large.pods[0].children[0].style.getPropertyValue("--scw-pod-cells"), "2");
  });

  it("packs custom rectangles along the appropriate axis", () => {
    const layout = trackLayout({ view: "slider", size: "large", shape: "tall", reach: 2 });
    for (const side of [false, true]) {
      const tall = controls({ side, buttonSize: "custom", width: 24, height: 64 });
      const wide = controls({ side, buttonSize: "custom", width: 64, height: 24 });
      tall.fit(layout);
      wide.fit(layout);
      const rows = (state) => Number(state.pods[0].children[0].style.getPropertyValue("--scw-pod-cells"));
      if (side) assert.ok(rows(tall) > rows(wide), "side panels pack by button width");
      else assert.ok(rows(wide) > rows(tall), "horizontal panels pack by button height");
    }
  });

  it("ignores separators and does not add rows for hidden controls", () => {
    const { pods, fit } = controls({ main: 0, tools: 1 });
    fit(trackLayout({ view: "slider", size: "large", shape: "tall", reach: 2 }));
    for (const pod of pods) {
      assert.equal(pod.children[0].style.getPropertyValue("--scw-pod-cells"), "1");
      assert.equal(pod.children[1].style.getPropertyValue("--scw-pod-cells"), "1");
    }
  });

  it("preserves equal-sized pods for the other views, clearing stale minimums", () => {
    const { pods, fit } = controls();
    pods[0].style.setProperty("--scw-pod-h", "500px");
    fit(trackLayout({ view: "carousel", size: "small", reach: 3 }));
    for (const pod of pods) {
      assert.equal(pod.style.getPropertyValue("--scw-pod-h"), "40px");
      assert.equal(pod.style.getPropertyValue("--scw-pod-w"), "90px");
    }
  });
});

describe("bar button sizes", () => {
  it("normalizes custom dimensions independently and ignores them for presets", () => {
    const dimensions = (barSize, barButtonSize, custom = {}) => WheelAppearance.barButtonDimensions({ barSize, barButtonSize, ...custom });
    assert.deepEqual(dimensions("compact", "custom", { barButtonWidth: 24, barButtonHeight: 64 }), { width: 24, height: 64 });
    assert.deepEqual(dimensions("normal", "custom", { barButtonWidth: 1000, barButtonHeight: 1 }), { width: 64, height: 24 });
    assert.deepEqual(dimensions("normal", "custom", { barButtonWidth: "31", barButtonHeight: 37.6 }), { width: 31, height: 38 });
    assert.deepEqual(dimensions("normal", "custom", { barButtonWidth: NaN, barButtonHeight: Infinity }), { width: 28, height: 28 });
    assert.deepEqual(dimensions("compact", "custom"), { width: 28, height: 28 });
    assert.deepEqual(dimensions("compact", "auto", { barButtonWidth: 64, barButtonHeight: 64 }), { width: 24, height: 24 });
    assert.deepEqual(dimensions("compact", "large", { barButtonWidth: 24, barButtonHeight: 64 }), { width: 36, height: 36 });
  });

  it("marks only an explicit size", () => {
    for (const barButtonSize of ["compact", "normal", "large", "custom"]) assert.equal(WheelAppearance.hasExplicitButtons({ barButtonSize }), true);
    for (const barButtonSize of ["auto", undefined, "removed", "__proto__"]) assert.equal(WheelAppearance.hasExplicitButtons({ barButtonSize }), false);
  });

  it("keeps automatic sizes and accepts independent explicit sizes", () => {
    assert.equal(WheelAppearance.barButtonSize("compact"), 24);
    assert.equal(WheelAppearance.barButtonSize("normal"), 28);
    assert.equal(WheelAppearance.barButtonSize("compact", "normal"), 28);
    assert.equal(WheelAppearance.barButtonSize("normal", "compact"), 24);
    assert.equal(WheelAppearance.barButtonSize("compact", "large"), 36);
    assert.equal(WheelAppearance.barButtonSize("compact", "removed"), 24);
    assert.equal(WheelAppearance.barButtonSize("normal", "__proto__"), 28);
  });

  it("grows a compact bar and a side rail only as needed to contain the buttons", () => {
    const thickness = (orientation, expanded, barSize, barButtonSize, custom = {}) => WheelAppearance.barThickness(orientation, expanded, { barSize, barButtonSize, ...custom });
    for (const orientation of ["up", "down", "left", "right"]) {
      assert.equal(thickness(orientation, false, "compact"), 32);
      assert.equal(thickness(orientation, false, "compact", "normal"), 36);
      assert.equal(thickness(orientation, false, "compact", "large"), 44);
      assert.equal(thickness(orientation, false, "normal", "compact"), 44);
    }
    const custom = { barButtonWidth: 24, barButtonHeight: 64 };
    assert.equal(thickness("up", false, "compact", "custom", custom), 72);
    assert.equal(thickness("right", false, "compact", "custom", custom), 32);
  });

  it("grows the expanded bar with its button row, so the details keep their room", () => {
    const thickness = (orientation, barSize, barButtonSize, custom = {}) => WheelAppearance.barThickness(orientation, true, { barSize, barButtonSize, ...custom });
    for (const barSize of ["normal", "compact"]) {
      assert.equal(thickness("up", barSize, "auto"), 256, "automatic buttons keep the designed depth");
      assert.equal(thickness("right", barSize, "auto"), 320);
    }
    assert.equal(thickness("up", "compact", "large"), 256 + 12);
    const custom = { barButtonWidth: 64, barButtonHeight: 64 };
    for (const [orientation, expanded] of [["up", 256], ["right", 320]]) {
      const details = expanded - 44;
      assert.equal(thickness(orientation, "normal", "custom", custom) - WheelAppearance.barThickness(orientation, false, { barSize: "normal", barButtonSize: "custom", ...custom }), details);
    }
  });

  it("fits the measured inline controls when they extend past the portraits", () => {
    const root = node();
    root.querySelector = () => ({ offsetWidth: 800, offsetHeight: 600 });
    assert.equal(WheelAppearance.barSpan(root, { barWidth: 400 }), 800);
    const side = node(["scw-side"]);
    side.querySelector = root.querySelector;
    assert.equal(WheelAppearance.barSpan(side, { barWidth: 400 }), 600);
    root.querySelector = () => null;
    assert.equal(WheelAppearance.barSpan(root, { barWidth: 400 }), 400);
  });
});
