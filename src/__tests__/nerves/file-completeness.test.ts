import { describe, it, expect } from "vitest"

/**
 * Tests for the file completeness check (Rule 5).
 *
 * The check should:
 * 1. Flag production files with zero emitNervesEvent calls (fail)
 * 2. Exempt type-only files (only type/interface/enum, no function/class/const)
 * 3. Pass for files that have at least one emitNervesEvent call
 */

import { checkFileCompleteness, isTypeOnlyFile } from "../../nerves/coverage/file-completeness"

describe("file completeness (Rule 5)", () => {
  describe("isTypeOnlyFile", () => {
    it("returns true for file with only type/interface/enum declarations", () => {
      const source = `
export type Foo = { bar: string }
export interface Baz { qux: number }
export enum Status { Active, Inactive }
`
      expect(isTypeOnlyFile(source)).toBe(true)
    })

    it("returns false for file with function declaration", () => {
      const source = `
export type Foo = { bar: string }
export function doSomething(): void {}
`
      expect(isTypeOnlyFile(source)).toBe(false)
    })

    it("returns false for file with const declaration", () => {
      const source = `
export type Foo = { bar: string }
export const VALUE = 42
`
      expect(isTypeOnlyFile(source)).toBe(false)
    })

    it("returns false for file with class declaration", () => {
      const source = `
export type Foo = { bar: string }
export class MyClass {}
`
      expect(isTypeOnlyFile(source)).toBe(false)
    })

    it("returns true for file with const-as-const declarations (type-equivalent frozen values)", () => {
      const source = `
export const PHASES = ["a", "b", "c"] as const
export type Phase = (typeof PHASES)[number]
export interface Config { phase: Phase }
`
      expect(isTypeOnlyFile(source)).toBe(true)
    })

    it("returns false for file mixing const-as-const and regular const", () => {
      const source = `
export const PHASES = ["a", "b"] as const
export const VALUE = 42
`
      expect(isTypeOnlyFile(source)).toBe(false)
    })

    it("returns true for empty file", () => {
      expect(isTypeOnlyFile("")).toBe(true)
    })
  })

  describe("checkFileCompleteness", () => {
    it("passes for file with emitNervesEvent call", () => {
      const files = new Map<string, string[]>([
        ["src/engine/core.ts", ["engine:engine.turn_start"]],
      ])
      const fileContents = new Map<string, string>([
        ["src/engine/core.ts", 'emitNervesEvent({ component: "engine", event: "engine.turn_start" })'],
      ])
      const result = checkFileCompleteness(files, fileContents)
      expect(result.status).toBe("pass")
      expect(result.missing).toHaveLength(0)
    })

    it("fails for production file with zero emitNervesEvent calls", () => {
      const files = new Map<string, string[]>([
        ["src/engine/core.ts", ["engine:engine.turn_start"]],
      ])
      const fileContents = new Map<string, string>([
        ["src/engine/core.ts", 'emitNervesEvent({ component: "engine", event: "engine.turn_start" })'],
        ["src/engine/helper.ts", "export function helper() { return 42 }"],
      ])
      const result = checkFileCompleteness(files, fileContents)
      expect(result.status).toBe("fail")
      expect(result.missing).toContain("src/engine/helper.ts")
    })

    it("exempts type-only file with zero calls", () => {
      const files = new Map<string, string[]>([
        ["src/engine/core.ts", ["engine:engine.turn_start"]],
      ])
      const fileContents = new Map<string, string>([
        ["src/engine/core.ts", 'emitNervesEvent({ component: "engine", event: "engine.turn_start" })'],
        ["src/engine/types.ts", "export type Foo = { bar: string }\nexport interface Baz {}"],
      ])
      const result = checkFileCompleteness(files, fileContents)
      expect(result.status).toBe("pass")
      expect(result.missing).toHaveLength(0)
    })

    it("returns pass when all files have events or are exempt", () => {
      const files = new Map<string, string[]>([
        ["src/a.ts", ["x:y"]],
        ["src/b.ts", ["x:z"]],
      ])
      const fileContents = new Map<string, string>([
        ["src/a.ts", 'emitNervesEvent({ component: "x", event: "y" })'],
        ["src/b.ts", 'emitNervesEvent({ component: "x", event: "z" })'],
      ])
      const result = checkFileCompleteness(files, fileContents)
      expect(result.status).toBe("pass")
    })
  })
})
