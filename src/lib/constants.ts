// 学科与考试类型常量配置

export type SubjectKey =
  | 'chinese'
  | 'math'
  | 'english'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'history'
  | 'geography'
  | 'politics'
  | 'it'

export interface SubjectConfig {
  key: SubjectKey
  name: string
  shortName: string
  color: string
  defaultFullScore: number
  fixedQuestionCount?: number
  assigned?: boolean // 是否赋分科目（小三门）
}

export const SUBJECTS: Record<SubjectKey, SubjectConfig> = {
  chinese:    { key: 'chinese',    name: '语文',     shortName: '语', color: '#ef4444', defaultFullScore: 150 },
  math:       { key: 'math',       name: '数学',     shortName: '数', color: '#3b82f6', defaultFullScore: 150, fixedQuestionCount: 21 },
  english:    { key: 'english',    name: '英语',     shortName: '英', color: '#10b981', defaultFullScore: 150 },
  physics:    { key: 'physics',    name: '物理',     shortName: '物', color: '#f59e0b', defaultFullScore: 100, assigned: true },
  chemistry:  { key: 'chemistry',  name: '化学',     shortName: '化', color: '#8b5cf6', defaultFullScore: 100, assigned: true },
  biology:    { key: 'biology',    name: '生物',     shortName: '生', color: '#06b6d4', defaultFullScore: 100, assigned: true },
  history:    { key: 'history',    name: '历史',     shortName: '史', color: '#a855f7', defaultFullScore: 100, assigned: true },
  geography:  { key: 'geography',  name: '地理',     shortName: '地', color: '#84cc16', defaultFullScore: 100, assigned: true },
  politics:   { key: 'politics',   name: '政治',     shortName: '政', color: '#ec4899', defaultFullScore: 100, assigned: true },
  it:         { key: 'it',         name: '信息技术', shortName: '信', color: '#64748b', defaultFullScore: 100 },
}

// 内置考试类型
export type ExamType =
  | 'monthly5'    // 月考 5门：语数英物化
  | 'monthly6'    // 月考 6门：语数英 + 用户选科小三门
  | 'midterm10'   // 期中 10门
  | 'final10'     // 期末 10门
  | 'midterm6'    // 期中 6门：语数英 + 用户选科小三门
  | 'final6'      // 期末 6门：语数英 + 用户选科小三门
  | 'custom'      // 自定义

export interface ExamTypeConfig {
  type: ExamType
  name: string
  shortName: string
  subjects: SubjectKey[] // 仅内置类型有；monthly6/midterm6/final6 的 subjects 在运行时根据用户选科动态计算
  category: 'monthly' | 'midterm' | 'final' | 'custom'
  usesElective?: boolean // 是否使用用户选科
}

// 注意：monthly6/midterm6/final6 的 subjects 在运行时需要根据用户选科动态拼接
// 这里给一个默认值（物化生），实际使用时会用 resolveExamSubjects() 替换
export const EXAM_TYPES: Record<ExamType, ExamTypeConfig> = {
  monthly5:  { type: 'monthly5',  name: '月考（5门）',  shortName: '月考5',  subjects: ['chinese','math','english','physics','chemistry'], category: 'monthly' },
  monthly6:  { type: 'monthly6',  name: '月考（6门）',  shortName: '月考6',  subjects: ['chinese','math','english'], category: 'monthly', usesElective: true },
  midterm10: { type: 'midterm10', name: '期中（10门）', shortName: '期中10', subjects: ['chinese','math','english','physics','chemistry','biology','history','geography','politics','it'], category: 'midterm' },
  final10:   { type: 'final10',   name: '期末（10门）', shortName: '期末10', subjects: ['chinese','math','english','physics','chemistry','biology','history','geography','politics','it'], category: 'final' },
  midterm6:  { type: 'midterm6',  name: '期中（6门）',  shortName: '期中6',  subjects: ['chinese','math','english'], category: 'midterm', usesElective: true },
  final6:    { type: 'final6',    name: '期末（6门）',  shortName: '期末6',  subjects: ['chinese','math','english'], category: 'final', usesElective: true },
  custom:    { type: 'custom',    name: '自定义',       shortName: '自定义', subjects: [], category: 'custom' },
}

export type GradeLevel =
  | '高一上' | '高一下'
  | '高二上' | '高二下'
  | '高三上' | '高三下'

export const GRADE_LEVELS: GradeLevel[] = [
  '高一上', '高一下', '高二上', '高二下', '高三上', '高三下'
]

// 默认选科（用户首次注册时使用，可后续修改）
export const DEFAULT_ELECTIVE_SUBJECTS: SubjectKey[] = ['physics', 'chemistry', 'biology']

// 所有可选的小三门科目（6选3）
export const ELECTIVE_OPTIONS: SubjectKey[] = [
  'physics', 'chemistry', 'biology', 'history', 'geography', 'politics'
]

// 解析某考试的实际科目
export function resolveExamSubjects(
  examType: ExamType,
  electiveSubjects: SubjectKey[] = DEFAULT_ELECTIVE_SUBJECTS,
  customSubjects?: SubjectKey[]
): SubjectKey[] {
  const config = EXAM_TYPES[examType]
  if (examType === 'custom') {
    return customSubjects ?? []
  }
  if (config.usesElective) {
    return ['chinese', 'math', 'english', ...electiveSubjects]
  }
  return config.subjects
}

// 获取学科列表
export function getSubjects(subjects: SubjectKey[]) {
  return subjects.map(s => SUBJECTS[s])
}

// 获取学科颜色
export function getSubjectColor(key: SubjectKey): string {
  return SUBJECTS[key].color
}

// 获取学科名称
export function getSubjectName(key: SubjectKey): string {
  return SUBJECTS[key].name
}
