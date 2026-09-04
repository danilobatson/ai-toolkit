import { vi } from "vitest";

export const mockGet = vi.fn();
export const mockSet = vi.fn();
export const mockDel = vi.fn();
export const mockKeys = vi.fn();
export const mockQuit = vi.fn();

export default vi.fn().mockImplementation(() => ({
	get: mockGet,
	set: mockSet,
	del: mockDel,
	keys: mockKeys,
	quit: mockQuit,
}));
