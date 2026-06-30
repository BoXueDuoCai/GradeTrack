// 上海赋分等级表（小三门：物化生史地政）
// 100分制按比例折算成70分制

export type GradeLevel =
  | 'A+' | 'A' | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D+' | 'D' | 'E'

export const GRADE_TO_SCORE: Record<GradeLevel, number> = {
  'A+': 70, 'A': 67, 'B+': 64, 'B': 61, 'B-': 58,
  'C+': 55, 'C': 52, 'C-': 49,
  'D+': 46, 'D': 43, 'E': 40,
}

export const ALL_GRADES: GradeLevel[] = [
  'A+', 'A', 'B+', 'B', 'B-',
  'C+', 'C', 'C-',
  'D+', 'D', 'E',
]

// 哪些科目需要赋分（小三门：物化生史地政）
// 语数英 always 原始分；信息技术不在赋分范围
export const ASSIGNED_SUBJECTS: SubjectKey[] = [
  'physics', 'chemistry', 'biology',
  'history', 'geography', 'politics',
]

import { SubjectKey } from './constants'

export function isAssignedSubject(subject: SubjectKey): boolean {
  return ASSIGNED_SUBJECTS.includes(subject)
}

export function getAssignedScore(grade: GradeLevel | string | null | undefined): number | null {
  if (!grade) return null
  return GRADE_TO_SCORE[grade as GradeLevel] ?? null
}

// 目标状态
export type GoalStatus = 'active' | 'pending' | 'completed' | 'abandoned'

export const GOAL_STATUS_CONFIG: Record<GoalStatus, { label: string; color: string; icon: string }> = {
  active:     { label: '进行中', color: '#3b82f6', icon: '○' },
  pending:    { label: '待开始', color: '#f59e0b', icon: '◐' },
  completed:  { label: '已完成', color: '#10b981', icon: '✓' },
  abandoned:  { label: '已放弃', color: '#6b7280', icon: '✗' },
}

export const ALL_GOAL_STATUSES: GoalStatus[] = ['active', 'pending', 'completed', 'abandoned']
