// Process template awareness -- fetches process template definitions from ADO,
// derives hierarchy rules, and validates parent/child work item type relationships.

import { adoRequest } from "./ado-client"

export interface ProcessTemplate {
  templateName: string
  templateId: string
  workItemTypes: string[]
}

export interface ValidationResult {
  valid: boolean
  violations: string[]
}

interface ProjectProperty {
  name: string
  value: string
}

// Known hierarchy definitions for common ADO process templates.
// Maps template name to explicit parent -> allowed children mappings.
// Bug appears at multiple levels in Agile/Scrum (can be child of Feature, User Story, or PBI).
const KNOWN_HIERARCHIES: Record<string, Record<string, string[]>> = {
  "Basic": {
    "Epic": ["Issue"],
    "Issue": ["Task"],
    "Task": [],
  },
  "Agile": {
    "Epic": ["Feature"],
    "Feature": ["User Story", "Bug"],
    "User Story": ["Task", "Bug"],
    "Task": [],
    "Bug": ["Task"],
  },
  "Scrum": {
    "Epic": ["Feature"],
    "Feature": ["Product Backlog Item", "Bug"],
    "Product Backlog Item": ["Task", "Bug"],
    "Task": [],
    "Bug": ["Task"],
  },
  "CMMI": {
    "Epic": ["Feature"],
    "Feature": ["Requirement", "Bug"],
    "Requirement": ["Task", "Bug"],
    "Task": [],
    "Bug": ["Task"],
  },
}

/**
 * Fetch the process template for an ADO project.
 * Returns null if fetching fails (tools proceed without validation).
 */
export async function fetchProcessTemplate(
  token: string,
  organization: string,
  project: string,
): Promise<ProcessTemplate | null> {
  try {
    // Step 1: Get the process template type from project properties
    const propsResult = await adoRequest(
      token,
      "GET",
      organization,
      `/${project}/_apis/properties`,
    )

    let propsData: { value?: ProjectProperty[] }
    try {
      propsData = JSON.parse(propsResult)
    } catch {
      return null
    }

    const templateProp = propsData.value?.find(
      p => p.name === "System.ProcessTemplateType",
    )
    if (!templateProp) return null

    // Step 2: Fetch process template details
    const templateResult = await adoRequest(
      token,
      "GET",
      organization,
      `/_apis/work/processes/${templateProp.value}`,
    )

    let templateData: { name?: string; typeId?: string }
    try {
      templateData = JSON.parse(templateResult)
    } catch {
      return null
    }

    if (!templateData.name) return null

    // Step 3: Fetch work item types for the project
    const typesResult = await adoRequest(
      token,
      "GET",
      organization,
      `/${project}/_apis/wit/workitemtypes`,
    )

    let typesData: { value?: { name: string }[] }
    try {
      typesData = JSON.parse(typesResult)
    } catch {
      return null
    }

    if (!typesData.value) return null

    return {
      templateName: templateData.name,
      templateId: templateProp.value,
      workItemTypes: typesData.value.map(t => t.name),
    }
  } catch {
    return null
  }
}

/**
 * Derive hierarchy rules from a process template name and available work item types.
 * Returns a map of parent type -> allowed child types.
 *
 * For known templates (Basic, Agile, Scrum, CMMI), uses predefined hierarchies.
 * For unknown templates, returns empty child arrays (no validation possible).
 */
export function deriveHierarchyRules(
  templateName: string,
  workItemTypes: string[],
): Record<string, string[]> {
  const rules: Record<string, string[]> = {}

  // Initialize all types with empty children
  for (const type of workItemTypes) {
    rules[type] = []
  }

  const hierarchy = KNOWN_HIERARCHIES[templateName]
  if (!hierarchy) return rules

  // Apply known hierarchy rules, filtering to types actually present in the project
  const typeSet = new Set(workItemTypes)

  for (const [parentType, children] of Object.entries(hierarchy)) {
    if (typeSet.has(parentType)) {
      rules[parentType] = children.filter(t => typeSet.has(t))
    }
  }

  return rules
}

/**
 * Validate whether a child work item type can be parented under a given parent type.
 */
export function validateParentChild(
  rules: Record<string, string[]>,
  parentType: string,
  childType: string,
): ValidationResult {
  const allowedChildren = rules[parentType]

  if (allowedChildren === undefined) {
    return {
      valid: false,
      violations: [`Unknown parent type: ${parentType}. Not found in project's work item types.`],
    }
  }

  if (allowedChildren.length === 0) {
    return {
      valid: false,
      violations: [`${parentType} cannot have children (leaf type). ${childType} cannot be a child of ${parentType}.`],
    }
  }

  if (!allowedChildren.includes(childType)) {
    return {
      valid: false,
      violations: [`${childType} cannot be a child of ${parentType}. Allowed children: ${allowedChildren.join(", ")}.`],
    }
  }

  return { valid: true, violations: [] }
}
