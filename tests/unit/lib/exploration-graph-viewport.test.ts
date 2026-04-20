import { describe, expect, it } from "vitest";
import {
	clamp_graph_viewport,
	fit_graph_viewport,
	is_world_rect_visible,
	pan_graph_viewport,
	reveal_world_rect,
	screen_to_world_point,
	world_to_screen_point,
	zoom_graph_viewport_at_point,
} from "../../../src/lib/exploration-graph-viewport";

const graph_bounds = {
	x: 0,
	y: 0,
	width: 1000,
	height: 2000,
};

const viewport_size = {
	width: 500,
	height: 400,
};

describe("exploration-graph-viewport", () => {
	it("fits and centers the graph inside the available viewport", () => {
		const viewport = fit_graph_viewport(graph_bounds, viewport_size);

		expect(viewport.scale).toBeCloseTo(0.168, 3);
		expect(viewport.translate_x).toBeCloseTo(166, 0);
		expect(viewport.translate_y).toBeCloseTo(32, 0);
	});

	it("converts world and screen coordinates round-trip", () => {
		const viewport = fit_graph_viewport(graph_bounds, viewport_size);
		const world_point = { x: 320, y: 640 };
		const screen_point = world_to_screen_point(world_point, viewport);
		const round_trip = screen_to_world_point(screen_point, viewport);

		expect(round_trip.x).toBeCloseTo(world_point.x, 6);
		expect(round_trip.y).toBeCloseTo(world_point.y, 6);
	});

	it("preserves the anchor point when zooming around the cursor", () => {
		const viewport = {
			scale: 0.5,
			translate_x: -120,
			translate_y: -240,
		};
		const anchor_screen = { x: 240, y: 180 };
		const anchor_world_before = screen_to_world_point(anchor_screen, viewport);

		const zoomed = zoom_graph_viewport_at_point(
			viewport,
			anchor_screen,
			1.5,
			graph_bounds,
			viewport_size,
		);
		const anchor_world_after = screen_to_world_point(anchor_screen, zoomed);

		expect(anchor_world_after.x).toBeCloseTo(anchor_world_before.x, 6);
		expect(anchor_world_after.y).toBeCloseTo(anchor_world_before.y, 6);
	});

	it("clamps panning so the graph cannot drift infinitely away", () => {
		const viewport = {
			scale: 0.5,
			translate_x: -120,
			translate_y: -240,
		};
		const panned = pan_graph_viewport(
			viewport,
			{ x: 2000, y: 2000 },
			graph_bounds,
			viewport_size,
		);

		const clamped = clamp_graph_viewport(panned, graph_bounds, viewport_size);

		expect(panned).toEqual(clamped);
		expect(clamped.translate_x).toBeLessThanOrEqual(96);
		expect(clamped.translate_y).toBeLessThanOrEqual(96);
		expect(clamped.translate_y).toBeGreaterThanOrEqual(
			-viewport_size.height - 96,
		);
	});

	it("reveals an offscreen selected node by recentering it", () => {
		const viewport = {
			scale: 0.5,
			translate_x: -120,
			translate_y: -240,
		};
		const target = { x: 920, y: 1880, width: 80, height: 40 };

		expect(is_world_rect_visible(viewport, target, viewport_size, 24)).toBe(
			false,
		);

		const revealed = reveal_world_rect(
			viewport,
			target,
			graph_bounds,
			viewport_size,
			24,
		);

		expect(is_world_rect_visible(revealed, target, viewport_size, 24)).toBe(
			true,
		);
		const target_center = world_to_screen_point(
			{ x: target.x + target.width / 2, y: target.y + target.height / 2 },
			revealed,
		);
		expect(target_center.x).toBeGreaterThan(24);
		expect(target_center.x).toBeLessThan(viewport_size.width - 24);
		expect(target_center.y).toBeGreaterThan(24);
		expect(target_center.y).toBeLessThan(viewport_size.height - 24);
	});

	it("leaves an already visible selection in place", () => {
		const viewport = fit_graph_viewport(graph_bounds, viewport_size);
		const target = { x: 360, y: 640, width: 80, height: 40 };

		expect(is_world_rect_visible(viewport, target, viewport_size, 16)).toBe(
			true,
		);

		const revealed = reveal_world_rect(
			viewport,
			target,
			graph_bounds,
			viewport_size,
			16,
		);

		expect(revealed).toEqual(viewport);
	});
});
