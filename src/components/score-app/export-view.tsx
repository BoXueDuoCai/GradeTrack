'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileSpreadsheet, FileText, Download } from 'lucide-react'
import { useState } from 'react'
import { Exam } from './types'
import { toast } from 'sonner'

interface ExportViewProps {
  exams: Exam[]
}

export function ExportView({ exams }: ExportViewProps) {
  const [selectedExamId, setSelectedExamId] = useState<string>('all')
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)

  const handleExport = async (type: 'excel' | 'pdf') => {
    setExporting(type)
    try {
      const examId = selectedExamId === 'all' ? '' : `?examId=${selectedExamId}`
      if (type === 'pdf') {
        // PDF 导出为 HTML 报告（含中文，浏览器打印为 PDF）
        const url = `/api/export/pdf${examId}`
        window.open(url, '_blank')
        toast.success('已打开成绩报告，可使用浏览器"打印"功能保存为 PDF')
        return
      }
      // Excel 直接下载
      const res = await fetch(`/api/export/${type}${examId}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || '导出失败')
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i)
      const filename = match ? decodeURIComponent(match[1]) : `export.${type === 'excel' ? 'xlsx' : 'pdf'}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`已导出 ${filename}`)
    } catch (e) {
      toast.error('导出失败：' + (e as Error).message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold">导出数据</h2>
        <p className="text-sm text-muted-foreground">支持 Excel（.xlsx）和 PDF 两种格式</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>选择导出范围</CardTitle>
          <CardDescription>可导出全部考试或某场特定考试</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
            <div className="space-y-1.5 flex-1 w-full">
              <label className="text-sm font-medium">考试范围</label>
              <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部考试（{exams.length} 场）</SelectItem>
                  {exams.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-500">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <CardTitle>Excel 导出</CardTitle>
                <CardDescription>包含成绩总表 + 每场考试小分明细</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="text-xs text-muted-foreground space-y-1 mb-3">
              <li>• Sheet1：成绩总表（纵向，所有考试汇总）</li>
              <li>• Sheet2-N：每场考试一页，横排格式</li>
              <li>• 表头：科目 / 成绩 / 赋分 / 题号 1,2,3...</li>
              <li>• 赋分格式：A+/70（等级/赋分）</li>
              <li>• 没小分的格子用 - 表示</li>
            </ul>
            <Button
              className="w-full"
              onClick={() => handleExport('excel')}
              disabled={exporting !== null || exams.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              {exporting === 'excel' ? '导出中...' : '导出 Excel'}
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-md bg-red-500/10 text-red-500">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <CardTitle>PDF 导出</CardTitle>
                <CardDescription>正式成绩报告，便于打印</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="text-xs text-muted-foreground space-y-1 mb-3">
              <li>• 中文报告，每场考试一节</li>
              <li>• 成绩表 + 小分明细</li>
              <li>• 点击后在新窗口打开 HTML 报告</li>
              <li>• 使用浏览器"打印"功能保存为 PDF</li>
            </ul>
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => handleExport('pdf')}
              disabled={exams.length === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              打开 PDF 报告
            </Button>
          </CardContent>
        </Card>
      </div>

      {exams.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          还没有成绩数据，先去录入吧
        </div>
      )}
    </div>
  )
}
