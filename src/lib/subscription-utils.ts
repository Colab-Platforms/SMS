import { BillingCycle, Subscription, SubscriptionStatus } from '@/store/subscriptionStore'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { format } from 'date-fns'



/**
 * Calculate the next billing date based on the current date and billing cycle
 */
export function calculateNextBillingDate(
  currentDate: Date,
  billingCycle: BillingCycle
): string {
  const nextDate = new Date(currentDate)

  switch (billingCycle) {
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1)
      break
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1)
      break
    case 'quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3)
      break
    case 'semiannual':
      nextDate.setMonth(nextDate.getMonth() + 6)
      break
  }

  return nextDate.toISOString().split('T')[0]
}

/**
 * Calculate the next billing date based on start date, current date and billing cycle
 * Calculates the next billing date that occurs after the current date, based on the billing cycle from start date
 */
export function calculateNextBillingDateFromStart(
  startDate: Date,
  currentDate: Date,
  billingCycle: BillingCycle
): string {
  const today = new Date(currentDate)
  const start = new Date(startDate)

  // Start with the start date as the base
  const nextBilling = new Date(start)

  // Keep adding billing cycles until we get a date after today
  while (nextBilling <= today) {
    switch (billingCycle) {
      case 'monthly':
        nextBilling.setMonth(nextBilling.getMonth() + 1)
        break
      case 'yearly':
        nextBilling.setFullYear(nextBilling.getFullYear() + 1)
        break
      case 'quarterly':
        nextBilling.setMonth(nextBilling.getMonth() + 3)
        break
      case 'semiannual':
        nextBilling.setMonth(nextBilling.getMonth() + 6)
        break
    }
  }

  return nextBilling.toISOString().split('T')[0]
}

/**
 * Format a date as a readable string
 */
export function formatDate(dateString: string): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }
  
  return new Date(dateString).toLocaleDateString(undefined, options)
}

/**
 * Calculate time until next billing date
 */
export function getTimeUntilNextBilling(nextBillingDate: string): string {
  const today = new Date()
  const nextDate = new Date(nextBillingDate)
  const timeDiff = nextDate.getTime() - today.getTime()
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24))

  if (daysDiff < 0) {
    return 'Overdue'
  } else if (daysDiff === 0) {
    return 'Today'
  } else if (daysDiff === 1) {
    return 'Tomorrow'
  } else if (daysDiff < 7) {
    return `${daysDiff} days`
  } else if (daysDiff < 30) {
    const weeks = Math.floor(daysDiff / 7)
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`
  } else {
    const months = Math.floor(daysDiff / 30)
    return `${months} ${months === 1 ? 'month' : 'months'}`
  }
}

/**
 * Calculate days until a given date
 */
export function daysUntil(dateString: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const targetDate = new Date(dateString)
  targetDate.setHours(0, 0, 0, 0)
  
  const timeDiff = targetDate.getTime() - today.getTime()
  return Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)))
}

/**
 * Generate a status badge variant based on subscription status
 */
export function getStatusVariant(status: SubscriptionStatus): 'default' | 'secondary' | 'destructive' | 'warning' {
  switch (status) {
    case 'active':
      return 'default'
    case 'trial':
      return 'warning'
    case 'cancelled':
      return 'destructive'
    default:
      return 'secondary'
  }
}

/**
 * Get category label from subscription data with fallback to store data
 */
export function getCategoryLabel(
  subscription: { categoryId?: number; category?: { label: string } },
  categories: Array<{ id: number; value: string; label: string }>
): string {
  return subscription.category?.label ||
    categories.find(c => c.id === subscription.categoryId)?.label ||
    'Unknown Category'
}

/**
 * Get payment method label from subscription data with fallback to store data
 */
export function getPaymentMethodLabel(
  subscription: { paymentMethodId?: number; paymentMethod?: { label: string } },
  paymentMethods: Array<{ id: number; value: string; label: string }>
): string {
  return subscription.paymentMethod?.label ||
    paymentMethods.find(p => p.id === subscription.paymentMethodId)?.label ||
    'Unknown Payment Method'
}

/**
 * Check if a subscription is due for renewal (today or overdue)
 */
export function isSubscriptionDue(nextBillingDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const billingDate = new Date(nextBillingDate)
  billingDate.setHours(0, 0, 0, 0)

  return billingDate <= today
}

/**
 * Process automatic renewal for a subscription that is due
 */
export function processSubscriptionRenewal(subscription: Subscription): Partial<Subscription> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Calculate next billing date based on current next billing date and billing cycle
  const currentNextBilling = new Date(subscription.nextBillingDate)
  const newNextBilling = calculateNextBillingDate(currentNextBilling, subscription.billingCycle)

  return {
    lastBillingDate: todayStr,
    nextBillingDate: newNextBilling
  }
}

/**
 * Get color for subscription status
 */
export function getStatusColor(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':
      return 'text-emerald-500'
    case 'trial':
      return 'text-amber-500'
    case 'cancelled':
      return 'text-rose-500'
    default:
      return 'text-slate-500'
  }
}

/**
 * Get a formatted label for billing cycle
 */
export function getBillingCycleLabel(billingCycle: BillingCycle): string {
  switch (billingCycle) {
    case 'monthly':
      return 'Monthly'
    case 'yearly':
      return 'Yearly'
    case 'quarterly':
      return 'Quarterly'
    case 'semiannual':
      return 'Semiannual'
    default:
      return String(billingCycle)
  }
}

/**
 * Export subscriptions to JSON format
 */
export function exportSubscriptionsToJSON(subscriptions: Subscription[]): string {
  return JSON.stringify(subscriptions, null, 2)
}

/**
 * Download data as a file. Accepts either raw text (with a contentType to
 * wrap in a Blob) or an already-built Blob (e.g. from a PDF generator).
 */
export function downloadFile(data: string | Blob, filename: string, contentType?: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Get the ARGB fill color used to highlight a subscription status in the Excel export
 */
function getStatusFillARGB(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':
      return 'FF10B981' // emerald-500
    case 'trial':
      return 'FFF59E0B' // amber-500
    case 'cancelled':
      return 'FFF43F5E' // rose-500
    default:
      return 'FF64748B' // slate-500
  }
}

const EXCEL_HEADERS = [
  'Name', 'Plan', 'Billing Cycle', 'Next Billing', 'Amount', 'Currency',
  'Payment Method', 'Start Date', 'Status', 'Category', 'Renewal Type'
]
const EXCEL_COLUMN_WIDTHS = [24, 16, 13, 13, 12, 10, 18, 13, 12, 18, 13]
const EXCEL_BRAND_ARGB = 'FF2980B9'
const EXCEL_HEADER_ROW = 4
const EXCEL_AMOUNT_COL = 5
const EXCEL_STATUS_COL = 9
const EXCEL_RENEWAL_COL = 11

/**
 * Export subscriptions to a styled Excel (.xlsx) workbook with a branded
 * header banner, color-coded status cells and compact dd-MM-yy dates.
 */
export async function exportSubscriptionsToExcel(subscriptions: Subscription[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Subscription Manager'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Subscriptions', {
    views: [{ state: 'frozen', ySplit: EXCEL_HEADER_ROW }]
  })

  const colCount = EXCEL_HEADERS.length
  EXCEL_COLUMN_WIDTHS.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width
  })

  const fillRow = (rowNumber: number, argb: string) => {
    for (let c = 1; c <= colCount; c++) {
      sheet.getCell(rowNumber, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
    }
  }

  // --- Title banner ---
  sheet.mergeCells(1, 1, 1, colCount)
  fillRow(1, EXCEL_BRAND_ARGB)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = '📊 Subscriptions Report'
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  sheet.getRow(1).height = 28

  // --- Subtitle ---
  sheet.mergeCells(2, 1, 2, colCount)
  fillRow(2, EXCEL_BRAND_ARGB)
  const subtitleCell = sheet.getCell(2, 1)
  const generatedOn = format(new Date(), 'dd-MM-yy')
  subtitleCell.value = `Generated on ${generatedOn}  ·  ${subscriptions.length} subscription${subscriptions.length === 1 ? '' : 's'}`
  subtitleCell.font = { italic: true, size: 10, color: { argb: 'FFEAF2F8' } }
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  sheet.getRow(2).height = 18

  // Row 3 is left blank as a visual spacer between the banner and the table

  // --- Header row ---
  const headerRow = sheet.getRow(EXCEL_HEADER_ROW)
  EXCEL_HEADERS.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = label
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND_ARGB } }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  })
  headerRow.height = 20
  sheet.autoFilter = { from: { row: EXCEL_HEADER_ROW, column: 1 }, to: { row: EXCEL_HEADER_ROW, column: colCount } }

  // --- Data rows ---
  subscriptions.forEach((sub, idx) => {
    const row = sheet.getRow(EXCEL_HEADER_ROW + 1 + idx)
    const values = [
      sub.name,
      sub.plan,
      getBillingCycleLabel(sub.billingCycle),
      formatShortDate(sub.nextBillingDate),
      sub.amount,
      sub.currency,
      sub.paymentMethod?.label || 'Unknown',
      formatShortDate(sub.startDate),
      sub.status.charAt(0).toUpperCase() + sub.status.slice(1),
      sub.category?.label || sub.category?.value || 'Other',
      sub.renewalType === 'auto' ? '● Auto' : '○ Manual'
    ]
    values.forEach((value, i) => {
      row.getCell(i + 1).value = value
    })

    // Zebra striping for readability
    if (idx % 2 === 1) {
      for (let c = 1; c <= colCount; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } }
      }
    }

    // Bottom border on every data cell
    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFE5E9EF' } } }
    }

    const amountCell = row.getCell(EXCEL_AMOUNT_COL)
    amountCell.numFmt = '#,##0.00'
    amountCell.alignment = { horizontal: 'right' }

    // Status highlight — the core "highlight status" ask: green/amber/red fill
    const statusCell = row.getCell(EXCEL_STATUS_COL)
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: getStatusFillARGB(sub.status) } }
    statusCell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' }

    const renewalCell = row.getCell(EXCEL_RENEWAL_COL)
    renewalCell.font = { color: { argb: sub.renewalType === 'auto' ? 'FF2563EB' : 'FF64748B' } }

    row.height = 18
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

/**
 * Format a date string as dd-MM-yy for compact PDF/Excel display
 */
function formatShortDate(dateString: string): string {
  const date = new Date(dateString)
  return isNaN(date.getTime()) ? dateString : format(date, 'dd-MM-yy')
}

/**
 * Get the RGB color used to highlight a subscription status in the PDF
 */
function getStatusRGB(status: SubscriptionStatus): [number, number, number] {
  switch (status) {
    case 'active':
      return [16, 185, 129] // emerald-500
    case 'trial':
      return [245, 158, 11] // amber-500
    case 'cancelled':
      return [244, 63, 94] // rose-500
    default:
      return [100, 116, 139] // slate-500
  }
}

/**
 * Export subscriptions to PDF format
 */
export function exportSubscriptionsToPDF(subscriptions: Subscription[]): Blob {
  const doc = new jsPDF({ orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const BRAND_BLUE: [number, number, number] = [41, 128, 185]
  const HEADER_HEIGHT = 24

  // --- Branded header banner ---
  doc.setFillColor(...BRAND_BLUE)
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, 'F')

  // Simple vector "report" icon mark (rounded badge with stacked list bars)
  const badgeX = 14
  const badgeY = 6
  const badgeSize = 12
  doc.setFillColor(255, 255, 255)
  doc.roundedRect(badgeX, badgeY, badgeSize, badgeSize, 2.5, 2.5, 'F')
  doc.setDrawColor(...BRAND_BLUE)
  doc.setLineWidth(1.3)
  doc.line(badgeX + 2.5, badgeY + 3.5, badgeX + badgeSize - 2.5, badgeY + 3.5)
  doc.line(badgeX + 2.5, badgeY + 6, badgeX + badgeSize - 4.5, badgeY + 6)
  doc.line(badgeX + 2.5, badgeY + 8.5, badgeX + badgeSize - 2.5, badgeY + 8.5)

  // Title + subtitle
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Subscriptions Report', badgeX + badgeSize + 5, badgeY + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const generatedOn = format(new Date(), 'dd-MM-yy')
  doc.text(
    `Generated on ${generatedOn}  ·  ${subscriptions.length} subscription${subscriptions.length === 1 ? '' : 's'}`,
    badgeX + badgeSize + 5,
    badgeY + 11.5
  )
  doc.setTextColor(0, 0, 0)

  const headers = [
    'Name', 'Plan', 'Billing Cycle', 'Next Billing', 'Amount', 'Currency',
    'Payment Method', 'Start Date', 'Status', 'Category', 'Renewal Type'
  ]

  const STATUS_COL = 8
  const RENEWAL_COL = 10
  const AMOUNT_COL = 4

  const rows = subscriptions.map(sub => [
    sub.name,
    sub.plan,
    sub.billingCycle,
    formatShortDate(sub.nextBillingDate),
    String(sub.amount),
    sub.currency,
    sub.paymentMethod?.label || 'Unknown',
    formatShortDate(sub.startDate),
    sub.status.charAt(0).toUpperCase() + sub.status.slice(1),
    sub.category?.value || 'other',
    sub.renewalType
  ])

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: HEADER_HEIGHT + 6,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineColor: [225, 230, 235],
      lineWidth: 0.1,
      valign: 'middle'
    },
    headStyles: {
      fillColor: BRAND_BLUE,
      textColor: 255,
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250]
    },
    columnStyles: {
      [AMOUNT_COL]: { halign: 'right' },
      [STATUS_COL]: { halign: 'center', cellWidth: 22 },
      [RENEWAL_COL]: { cellWidth: 26, cellPadding: { top: 3, right: 3, bottom: 3, left: 7.5 } }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return

      // Status highlight pill
      if (data.column.index === STATUS_COL) {
        const status = subscriptions[data.row.index]?.status ?? 'active'
        const [r, g, b] = getStatusRGB(status)
        const label = data.cell.text.join(' ')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.5)

        const paddingX = 3
        const pillHeight = Math.min(data.cell.height - 4, 6.5)
        const textWidth = doc.getTextWidth(label)
        const pillWidth = Math.min(textWidth + paddingX * 2, data.cell.width - 4)
        const pillX = data.cell.x + (data.cell.width - pillWidth) / 2
        const pillY = data.cell.y + (data.cell.height - pillHeight) / 2

        doc.setFillColor(r, g, b)
        doc.roundedRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2, pillHeight / 2, 'F')

        doc.setTextColor(255, 255, 255)
        doc.text(label, pillX + pillWidth / 2, pillY + pillHeight / 2, {
          align: 'center',
          baseline: 'middle'
        })

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(0, 0, 0)
      }

      // Renewal type indicator dot (auto = filled blue, manual = outlined gray)
      if (data.column.index === RENEWAL_COL) {
        const sub = subscriptions[data.row.index]
        const dotR = 1.3
        const dotX = data.cell.x + 3.5
        const dotY = data.cell.y + data.cell.height / 2

        if (sub?.renewalType === 'auto') {
          doc.setFillColor(59, 130, 246) // blue-500
          doc.circle(dotX, dotY, dotR, 'F')
        } else {
          doc.setDrawColor(148, 163, 184) // slate-400
          doc.setLineWidth(0.4)
          doc.circle(dotX, dotY, dotR, 'S')
        }
      }
    }
  })

  // --- Footer on every page ---
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text('Subscription Manager', 14, pageHeight - 8)
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 14, pageHeight - 8, { align: 'right' })
  }

  return doc.output('blob')
}

/**
 * Parse CSV data into subscriptions
 * Returns an array of valid subscriptions and any errors encountered
 */
export function parseCSVToSubscriptions(
  csvData: string
): { subscriptions: Omit<Subscription, 'id' | 'lastBillingDate'>[]; errors: string[] } {
  const errors: string[] = []
  const subscriptions: Omit<Subscription, 'id' | 'lastBillingDate'>[] = []
  
  // Split the CSV into lines
  const lines = csvData.split('\n')
  if (lines.length < 2) {
    errors.push('CSV file does not contain enough data')
    return { subscriptions, errors }
  }
  
  // Parse headers to determine column indices
  const headers = parseCSVLine(lines[0])
  const requiredFields = ['name', 'amount', 'currency', 'billingCycle', 'nextBillingDate', 'status']
  
  // Check if all required fields are present
  for (const field of requiredFields) {
    if (!headers.includes(field)) {
      errors.push(`Required field '${field}' is missing from CSV headers`)
      return { subscriptions, errors }
    }
  }
  
  // Process each data row
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue // Skip empty lines
    
    try {
      const values = parseCSVLine(lines[i])
      if (values.length !== headers.length) {
        errors.push(`Line ${i + 1}: Column count mismatch`)
        continue
      }
      
      // Create an object with the CSV values
      const subscription: Record<string, unknown> = {}
      headers.forEach((header, index) => {
        if (header === 'amount') {
          const amount = parseFloat(values[index])
          subscription[header] = amount
          if (isNaN(amount)) {
            throw new Error(`Invalid amount value: ${values[index]}`)
          }
        } else {
          subscription[header] = values[index]
        }
      })
      
      // Validate required fields
      for (const field of requiredFields) {
        if (subscription[field] === undefined || subscription[field] === '') {
          throw new Error(`Missing required field: ${field}`)
        }
      }
      
      // Validate status field
      if (!['active', 'trial', 'cancelled'].includes(subscription.status as string)) {
        throw new Error(`Invalid status value: ${subscription.status}. Must be 'active', 'trial', or 'cancelled'.`)
      }

      // Validate billing cycle
      if (!['monthly', 'yearly', 'quarterly'].includes(subscription.billingCycle as string)) {
        throw new Error(`Invalid billingCycle value: ${subscription.billingCycle}. Must be 'monthly', 'yearly', or 'quarterly'.`)
      }

      // Validate renewal type (optional field with default)
      if (subscription.renewalType && !['auto', 'manual'].includes(subscription.renewalType as string)) {
        throw new Error(`Invalid renewalType value: ${subscription.renewalType}. Must be 'auto' or 'manual'.`)
      }

      // Set default values for optional fields
      if (!subscription.renewalType) {
        subscription.renewalType = 'manual'
      }
      if (!subscription.plan) {
        subscription.plan = ''
      }
      if (!subscription.startDate) {
        subscription.startDate = subscription.nextBillingDate
      }
      if (!subscription.notes) {
        subscription.notes = ''
      }
      if (!subscription.website) {
        subscription.website = ''
      }

      // Ensure required foreign key fields have default values
      if (!subscription.paymentMethodId) {
        subscription.paymentMethodId = 1 // Default to first payment method
      }
      if (!subscription.categoryId) {
        subscription.categoryId = 10 // Default to 'other' category
      }

      subscriptions.push(subscription as Omit<Subscription, 'id' | 'lastBillingDate'>)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Line ${i + 1}: ${errorMessage}`)
    }
  }
  
  return { subscriptions, errors }
}

/**
 * Parse a CSV line considering quotes
 */
function parseCSVLine(line: string): string[] {
  const result = []
  let inQuotes = false
  let currentValue = ''
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      // Check if this is an escaped quote (double quote inside quoted field)
      if (inQuotes && line[i + 1] === '"') {
        currentValue += '"'
        i++ // Skip the next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(currentValue)
      currentValue = ''
    } else {
      // Add character to current field
      currentValue += char
    }
  }
  
  // Add the last field
  result.push(currentValue)
  
  return result
}