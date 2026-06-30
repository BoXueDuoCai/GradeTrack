// 前端使用的类型定义

import { SubjectKey, ExamType } from '@/lib/constants'
import { GoalStatus, GradeLevel } from '@/lib/grade-system'

export interface SubScore {
  id?: string
  questionNo: string
  score?: number | null
  fullScore?: number | null
}

export interface SubjectScore {
  id?: string
  subject: SubjectKey
  rawScore?: number | null
  fullScore?: number | null
  assignedScore?: number | null
  grade?: GradeLevel | string | null
  classRank?: number | null
  gradeRank?: number | null
  note?: string | null
  subScores: SubScore[]
}

export interface Exam {
  id: string
  userId: string
  name: string
  examType: ExamType
  customSubjects?: SubjectKey[] | null
  grade: string
  date: string
  createdAt: string
  updatedAt: string
  scores: SubjectScore[]
}

export interface Goal {
  id: string
  userId: string
  title: string
  description?: string | null
  status: GoalStatus
  examId?: string | null
  dueDate?: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomExamType {
  type: string
  name: string
  subjects: SubjectKey[]
}

export type Role = 'super_admin' | 'admin' | 'user' | 'test_user'
export type AdminPermission = 'batch_import' | 'create_group' | 'publish_plan' | 'manage_users'

export interface AuthUser {
  id: string
  username: string
  role: Role
  displayName: string | null
  electiveSubjects: SubjectKey[] | null
  customExamTypes: CustomExamType[] | null
  mustChangePassword: boolean
  permissions: AdminPermission[]
  lastLoginAt: string | null
  lastLoginIp: string | null
}

// API 调用封装
export async function fetchExams(): Promise<Exam[]> {
  const res = await fetch('/api/exams')
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function saveExam(payload: Omit<Exam, 'userId' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Exam> {
  const isEdit = !!payload.id
  const res = await fetch(isEdit ? `/api/exams/${payload.id}` : '/api/exams', {
    method: isEdit ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function deleteExam(id: string): Promise<void> {
  const res = await fetch(`/api/exams/${id}`, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

export async function fetchGoals(): Promise<Goal[]> {
  const res = await fetch('/api/goals')
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function createGoal(payload: { title: string; description?: string; status?: GoalStatus; examId?: string; dueDate?: string }): Promise<Goal> {
  const res = await fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function updateGoal(id: string, patch: Partial<Goal>): Promise<Goal> {
  const res = await fetch(`/api/goals/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function deleteGoal(id: string): Promise<void> {
  const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

// 计算总分（原始分）
export function calcTotalRawScore(scores: SubjectScore[]): number | null {
  const valid = scores.filter(s => s.rawScore != null)
  if (valid.length === 0) return null
  return valid.reduce((sum, s) => sum + (s.rawScore ?? 0), 0)
}

// 计算总分（赋分）：语数英用原始分，小三门用赋分
export function calcTotalAssignedScore(scores: SubjectScore[]): number | null {
  const valid = scores.filter(s => {
    const eff = s.assignedScore ?? s.rawScore
    return eff != null
  })
  if (valid.length === 0) return null
  return valid.reduce((sum, s) => sum + (s.assignedScore ?? s.rawScore ?? 0), 0)
}

// 计算总分满分（赋分制：语数英 fullScore + 小三门 70）
// 语数英用其 fullScore（通常 150）
// 小三门（物化生史地政）如果有赋分（assignedScore != null），则按 70 算；否则用 fullScore
export function calcTotalFullScore(scores: SubjectScore[]): number | null {
  const ASSIGNED_SUBJECTS = ['physics', 'chemistry', 'biology', 'history', 'geography', 'politics']
  const valid = scores.filter(s => s.fullScore != null)
  if (valid.length === 0) return null
  return valid.reduce((sum, s) => {
    if (ASSIGNED_SUBJECTS.includes(s.subject) && s.assignedScore != null) {
      return sum + 70 // 赋分制满分 70
    }
    return sum + (s.fullScore ?? 0)
  }, 0)
}

// 计算原始分总分满分（全部按 fullScore，不考虑赋分）
export function calcTotalRawFullScore(scores: SubjectScore[]): number | null {
  const valid = scores.filter(s => s.fullScore != null)
  if (valid.length === 0) return null
  return valid.reduce((sum, s) => sum + (s.fullScore ?? 0), 0)
}

// 单科实际分（赋分优先）
export function getEffectiveScore(s: SubjectScore): number | null {
  return s.assignedScore ?? s.rawScore
}

// 计算得分率
export function calcRate(score?: number | null, fullScore?: number | null): number | null {
  if (score == null || !fullScore) return null
  return score / fullScore
}

// 格式化日期
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 格式化日期（中文）
export function formatDateCN(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

// Auth API
export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me')
  const json = await res.json()
  if (!json.success) return null
  return json.data
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function register(username: string, password: string, displayName?: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, displayName }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

// Settings API
export interface UserSettings {
  electiveSubjects: SubjectKey[]
  customExamTypes: CustomExamType[]
  displayName: string | null
}

export async function fetchSettings(): Promise<UserSettings> {
  const res = await fetch('/api/settings')
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

// Admin API
export interface AdminUser {
  id: string
  username: string
  role: Role
  displayName: string | null
  electiveSubjects: SubjectKey[] | null
  permissions: AdminPermission[]
  mustChangePassword: boolean
  lastLoginAt: string | null
  lastLoginIp: string | null
  createdAt: string
  examCount: number
  goalCount: number
  groupCount: number
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch('/api/users')
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function adminCreateUser(payload: {
  username: string
  password: string
  displayName?: string
  role?: Role
}): Promise<AdminUser> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function adminUpdateUser(id: string, patch: {
  password?: string
  role?: Role
  displayName?: string
  permissions?: AdminPermission[]
}): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

export async function adminDeleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

// 超管查看某用户的成绩
export async function fetchUserExams(userId: string): Promise<{
  user: { id: string; username: string; displayName: string | null; role: string }
  exams: Exam[]
}> {
  const res = await fetch(`/api/users/${userId}/exams`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

// 批量导入用户
export async function adminBatchImport(payload: {
  groupName: string
  members: Array<{ studentNo: string; username: string; displayName?: string }>
}): Promise<{ created: number; existing: number; groupId: string }> {
  const res = await fetch('/api/users/batch-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

// Group API
export interface GroupInfo {
  id: string
  name: string
  creatorId: string
  creatorName: string
  memberCount: number
  viewerCount: number
  studyPlanCount: number
  createdAt: string
  isCreator: boolean
  isViewer: boolean
  isSuperAdmin: boolean
}

export interface GroupMember {
  id: string
  userId: string
  username: string
  displayName: string | null
  studentNo: string
  examCount: number
}

export interface GroupViewer {
  id: string
  userId: string
  username: string
  displayName: string | null
}

export async function fetchGroups(): Promise<GroupInfo[]> {
  const res = await fetch('/api/groups')
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function fetchGroup(id: string): Promise<{
  group: GroupInfo
  members: GroupMember[]
  viewers: GroupViewer[]
}> {
  const res = await fetch(`/api/groups/${id}`)
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function createGroup(name: string): Promise<GroupInfo> {
  const res = await fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function deleteGroup(id: string): Promise<void> {
  const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

export async function addGroupMember(groupId: string, username: string, studentNo: string, displayName?: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, studentNo, displayName }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

export async function addGroupViewer(groupId: string, username: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}/viewers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

export async function removeGroupViewer(groupId: string, userId: string): Promise<void> {
  const res = await fetch(`/api/groups/${groupId}/viewers/${userId}`, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

// Study Plan API
export interface StudyPlan {
  id: string
  groupId: string
  groupName: string
  title: string
  content: string | null
  dueDate: string | null
  createdBy: string
  creatorName: string
  createdAt: string
}

export async function fetchStudyPlans(): Promise<StudyPlan[]> {
  const res = await fetch('/api/study-plans')
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function createStudyPlan(payload: {
  groupId: string
  title: string
  content?: string
  dueDate?: string
}): Promise<StudyPlan> {
  const res = await fetch('/api/study-plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function deleteStudyPlan(id: string): Promise<void> {
  const res = await fetch(`/api/study-plans/${id}`, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

export async function updateStudyPlan(id: string, patch: {
  title?: string
  content?: string
  dueDate?: string | null
}): Promise<void> {
  const res = await fetch(`/api/study-plans/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

// Personal Plan API (test_user 专属)
export interface PersonalPlan {
  id: string
  title: string
  content: string | null
  dueDate: string | null
  status: 'pending' | 'done'
  createdAt: string
}

export async function fetchPersonalPlans(): Promise<PersonalPlan[]> {
  const res = await fetch('/api/personal-plans')
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function createPersonalPlan(payload: {
  title: string
  content?: string
  dueDate?: string
}): Promise<PersonalPlan> {
  const res = await fetch('/api/personal-plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
  return json.data
}

export async function updatePersonalPlan(id: string, patch: Partial<PersonalPlan>): Promise<void> {
  const res = await fetch(`/api/personal-plans/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}

export async function deletePersonalPlan(id: string): Promise<void> {
  const res = await fetch(`/api/personal-plans/${id}`, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error)
}
