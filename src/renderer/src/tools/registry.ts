import type { LucideIcon } from 'lucide-react'
import {
  Minimize2,
  RefreshCcw,
  Scaling,
  FileImage,
  FileDown,
  Combine,
  Scissors,
  Trash2,
  RotateCw,
  Images,
  Lock,
  LockOpen,
  FileText,
  FileType2
} from 'lucide-react'
import type { OptionValue, ToolId, ToolOptions } from '@shared/types'

export type Category = 'image' | 'pdf' | 'office'

export interface Choice {
  value: string
  label: string
  hint?: string
}

export interface Field {
  key: string
  label: string
  type: 'segmented' | 'select' | 'slider' | 'number' | 'toggle' | 'text' | 'password' | 'chips'
  choices?: Choice[]
  min?: number
  max?: number
  step?: number
  unit?: string
  placeholder?: string
  hint?: string
  /** Quick-pick values shown under a number field. */
  presets?: number[]
  show?: (o: ToolOptions) => boolean
}

export interface ToolDef {
  id: ToolId
  name: string
  tagline: string
  category: Category
  icon: LucideIcon
  /** Two colours for the tool's gradient. */
  colors: [string, string]
  accept: string[]
  /** All files become one result (merge, images → PDF). Order matters and can be changed. */
  combine?: boolean
  minFiles?: number
  action: string
  fields: Field[]
  defaults: Record<string, OptionValue>
}

const IMAGE_IN = ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'gif', 'tif', 'tiff', 'heic', 'heif', 'svg']
const OFFICE_IN = ['doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp']

const OUTPUT_FORMATS: Choice[] = [
  { value: 'jpg', label: 'JPG' },
  { value: 'jpeg', label: 'JPEG', hint: 'Same format as JPG, with a .jpeg extension' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'gif', label: 'GIF' },
  { value: 'tiff', label: 'TIFF' }
]

const OFFICE_ENGINE: Field = {
  key: 'engine',
  label: 'Conversion engine',
  type: 'select',
  choices: [
    { value: 'auto', label: 'Automatic', hint: 'Microsoft Office when installed (best fidelity), otherwise LibreOffice' },
    { value: 'libreoffice', label: 'LibreOffice' },
    { value: 'msoffice', label: 'Microsoft Office (Windows)' }
  ]
}

export const TOOLS: ToolDef[] = [
  {
    id: 'compress-image',
    name: 'Compress Image',
    tagline: 'Shrink JPG, PNG, WebP and more — or hit an exact size like 70 KB.',
    category: 'image',
    icon: Minimize2,
    colors: ['#ff4ecd', '#ff9a3c'],
    accept: IMAGE_IN,
    action: 'Compress',
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'segmented',
        choices: [
          { value: 'quality', label: 'Quality level' },
          { value: 'target', label: 'Target size' }
        ]
      },
      {
        key: 'level',
        label: 'Compression',
        type: 'chips',
        show: (o) => o.mode === 'quality',
        choices: [
          { value: 'best', label: 'Light', hint: 'Visually identical' },
          { value: 'balanced', label: 'Balanced', hint: 'Best trade-off' },
          { value: 'small', label: 'Strong', hint: 'Much smaller' },
          { value: 'tiny', label: 'Extreme', hint: 'Smallest file' }
        ]
      },
      {
        key: 'targetKB',
        label: 'Maximum file size',
        type: 'number',
        unit: 'KB',
        min: 5,
        max: 50000,
        presets: [20, 50, 70, 100, 200, 500, 1000],
        show: (o) => o.mode === 'target',
        hint: 'Finds the best quality that fits. If needed, the image is scaled down too.'
      },
      {
        key: 'format',
        label: 'Output format',
        type: 'select',
        choices: [
          { value: 'same', label: 'Same as original' },
          { value: 'jpg', label: 'JPG' },
          { value: 'webp', label: 'WebP', hint: 'Usually 25–35% smaller than JPG' },
          { value: 'avif', label: 'AVIF', hint: 'Smallest, but older apps may not open it' },
          { value: 'png', label: 'PNG' }
        ]
      },
      {
        key: 'maxSide',
        label: 'Limit dimensions',
        type: 'select',
        choices: [
          { value: '0', label: 'Keep original size' },
          { value: '3840', label: '4K — 3840 px' },
          { value: '2560', label: '2560 px' },
          { value: '1920', label: 'Full HD — 1920 px' },
          { value: '1280', label: '1280 px' },
          { value: '800', label: '800 px' }
        ]
      },
      { key: 'strip', label: 'Remove photo metadata (location, camera info)', type: 'toggle', show: (o) => o.mode === 'quality' }
    ],
    defaults: { mode: 'quality', level: 'balanced', targetKB: 100, format: 'same', maxSide: '0', strip: true }
  },
  {
    id: 'convert-image',
    name: 'Convert Image',
    tagline: 'JPG ↔ PNG ↔ WebP ↔ AVIF, plus iPhone HEIC photos.',
    category: 'image',
    icon: RefreshCcw,
    colors: ['#a855f7', '#ec4899'],
    accept: IMAGE_IN,
    action: 'Convert',
    fields: [
      { key: 'format', label: 'Convert to', type: 'chips', choices: OUTPUT_FORMATS },
      { key: 'quality', label: 'Quality', type: 'slider', min: 40, max: 100, step: 1, unit: '%', show: (o) => ['jpg', 'jpeg', 'webp', 'avif'].includes(String(o.format)) },
      { key: 'strip', label: 'Remove photo metadata', type: 'toggle' }
    ],
    defaults: { format: 'jpg', quality: 90, strip: false }
  },
  {
    id: 'resize-image',
    name: 'Resize Image',
    tagline: 'Set exact pixels or scale by percentage.',
    category: 'image',
    icon: Scaling,
    colors: ['#f59e0b', '#ef4444'],
    accept: IMAGE_IN,
    action: 'Resize',
    fields: [
      {
        key: 'by',
        label: 'Resize by',
        type: 'segmented',
        choices: [
          { value: 'percent', label: 'Percentage' },
          { value: 'pixels', label: 'Pixels' }
        ]
      },
      { key: 'percent', label: 'Scale', type: 'slider', min: 5, max: 200, step: 5, unit: '%', show: (o) => o.by === 'percent' },
      { key: 'width', label: 'Width', type: 'number', unit: 'px', min: 0, placeholder: 'Auto', show: (o) => o.by === 'pixels' },
      { key: 'height', label: 'Height', type: 'number', unit: 'px', min: 0, placeholder: 'Auto', show: (o) => o.by === 'pixels', hint: 'Leave one empty to keep the proportions.' },
      {
        key: 'fit',
        label: 'When both are set',
        type: 'select',
        show: (o) => o.by === 'pixels' && Number(o.width) > 0 && Number(o.height) > 0,
        choices: [
          { value: 'inside', label: 'Fit inside (keep proportions)' },
          { value: 'cover', label: 'Crop to fill exactly' },
          { value: 'fill', label: 'Stretch to exact size' }
        ]
      },
      { key: 'enlarge', label: 'Allow making images bigger', type: 'toggle', show: (o) => o.by === 'pixels' }
    ],
    defaults: { by: 'percent', percent: 50, width: 1920, height: 0, fit: 'inside', enlarge: false }
  },
  {
    id: 'images-to-pdf',
    name: 'Images to PDF',
    tagline: 'Turn photos and scans into one tidy PDF.',
    category: 'pdf',
    icon: FileImage,
    colors: ['#22d3ee', '#6366f1'],
    accept: IMAGE_IN,
    combine: true,
    action: 'Create PDF',
    fields: [
      {
        key: 'pageSize',
        label: 'Page size',
        type: 'segmented',
        choices: [
          { value: 'a4', label: 'A4' },
          { value: 'letter', label: 'Letter' },
          { value: 'fit', label: 'Fit image' }
        ]
      },
      {
        key: 'orientation',
        label: 'Orientation',
        type: 'segmented',
        show: (o) => o.pageSize !== 'fit',
        choices: [
          { value: 'auto', label: 'Auto' },
          { value: 'portrait', label: 'Portrait' },
          { value: 'landscape', label: 'Landscape' }
        ]
      },
      {
        key: 'margin',
        label: 'Margin',
        type: 'segmented',
        choices: [
          { value: 'none', label: 'None' },
          { value: 'small', label: 'Small' },
          { value: 'large', label: 'Large' }
        ]
      },
      {
        key: 'imageQuality',
        label: 'Image quality',
        type: 'chips',
        choices: [
          { value: 'original', label: 'Original', hint: 'Largest file' },
          { value: 'high', label: 'High', hint: 'Print quality' },
          { value: 'compact', label: 'Compact', hint: 'Great for email' }
        ]
      }
    ],
    defaults: { pageSize: 'a4', orientation: 'auto', margin: 'small', imageQuality: 'high' }
  },
  {
    id: 'compress-pdf',
    name: 'Compress PDF',
    tagline: 'Make big PDFs small enough to email or upload.',
    category: 'pdf',
    icon: FileDown,
    colors: ['#f43f5e', '#fb923c'],
    accept: ['pdf'],
    action: 'Compress',
    fields: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'segmented',
        choices: [
          { value: 'level', label: 'Compression level' },
          { value: 'target', label: 'Target size' }
        ]
      },
      {
        key: 'level',
        label: 'Compression',
        type: 'chips',
        show: (o) => o.mode === 'level',
        choices: [
          { value: 'light', label: 'Light', hint: '300 dpi · print' },
          { value: 'recommended', label: 'Recommended', hint: '150 dpi · screen' },
          { value: 'strong', label: 'Strong', hint: '72 dpi · smaller' },
          { value: 'extreme', label: 'Extreme', hint: '50 dpi · smallest' }
        ]
      },
      {
        key: 'targetKB',
        label: 'Maximum file size',
        type: 'number',
        unit: 'KB',
        min: 20,
        presets: [100, 200, 500, 1000, 2000, 5000],
        show: (o) => o.mode === 'target',
        hint: 'Tries each level from lightest to strongest and keeps the first one that fits.'
      },
      { key: 'grayscale', label: 'Convert to black & white', type: 'toggle' }
    ],
    defaults: { mode: 'level', level: 'recommended', targetKB: 1000, grayscale: false }
  },
  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    tagline: 'Combine several PDFs into one, in any order.',
    category: 'pdf',
    icon: Combine,
    colors: ['#10b981', '#06b6d4'],
    accept: ['pdf'],
    combine: true,
    minFiles: 2,
    action: 'Merge',
    fields: [],
    defaults: {}
  },
  {
    id: 'split-pdf',
    name: 'Split PDF',
    tagline: 'Break a PDF into pages or pull out the ones you need.',
    category: 'pdf',
    icon: Scissors,
    colors: ['#8b5cf6', '#3b82f6'],
    accept: ['pdf'],
    action: 'Split',
    fields: [
      {
        key: 'mode',
        label: 'Split mode',
        type: 'chips',
        choices: [
          { value: 'each', label: 'Every page', hint: 'One file per page' },
          { value: 'ranges', label: 'By ranges', hint: 'One file per range' },
          { value: 'extract', label: 'Extract', hint: 'Chosen pages → one file' }
        ]
      },
      { key: 'ranges', label: 'Pages', type: 'text', placeholder: 'e.g. 1-3, 5, 8-', show: (o) => o.mode !== 'each', hint: 'Separate with commas. "8-" means page 8 to the end.' }
    ],
    defaults: { mode: 'each', ranges: '' }
  },
  {
    id: 'remove-pages',
    name: 'Remove Pages',
    tagline: 'Delete the pages you don’t want.',
    category: 'pdf',
    icon: Trash2,
    colors: ['#ef4444', '#a855f7'],
    accept: ['pdf'],
    action: 'Remove pages',
    fields: [{ key: 'pages', label: 'Pages to remove', type: 'text', placeholder: 'e.g. 2, 5-7' }],
    defaults: { pages: '' }
  },
  {
    id: 'rotate-pdf',
    name: 'Rotate PDF',
    tagline: 'Fix sideways or upside-down pages.',
    category: 'pdf',
    icon: RotateCw,
    colors: ['#14b8a6', '#84cc16'],
    accept: ['pdf'],
    action: 'Rotate',
    fields: [
      {
        key: 'angle',
        label: 'Rotate',
        type: 'segmented',
        choices: [
          { value: '90', label: '90° right' },
          { value: '180', label: '180°' },
          { value: '270', label: '90° left' }
        ]
      },
      { key: 'pages', label: 'Only these pages', type: 'text', placeholder: 'All pages', hint: 'Leave empty to rotate every page.' }
    ],
    defaults: { angle: '90', pages: '' }
  },
  {
    id: 'pdf-to-images',
    name: 'PDF to Images',
    tagline: 'Save every page as a crisp JPG or PNG.',
    category: 'pdf',
    icon: Images,
    colors: ['#eab308', '#f97316'],
    accept: ['pdf'],
    action: 'Convert',
    fields: [
      {
        key: 'format',
        label: 'Image format',
        type: 'segmented',
        choices: [
          { value: 'jpg', label: 'JPG' },
          { value: 'png', label: 'PNG' }
        ]
      },
      {
        key: 'dpi',
        label: 'Resolution',
        type: 'chips',
        choices: [
          { value: '72', label: 'Low', hint: '72 dpi' },
          { value: '150', label: 'Medium', hint: '150 dpi' },
          { value: '300', label: 'High', hint: '300 dpi' }
        ]
      }
    ],
    defaults: { format: 'jpg', dpi: '150' }
  },
  {
    id: 'protect-pdf',
    name: 'Protect PDF',
    tagline: 'Lock a PDF with a password (AES-256).',
    category: 'pdf',
    icon: Lock,
    colors: ['#6366f1', '#ec4899'],
    accept: ['pdf'],
    action: 'Protect',
    fields: [{ key: 'password', label: 'Password', type: 'password', placeholder: 'Choose a password' }],
    defaults: { password: '' }
  },
  {
    id: 'unlock-pdf',
    name: 'Unlock PDF',
    tagline: 'Remove the password from a PDF you own.',
    category: 'pdf',
    icon: LockOpen,
    colors: ['#0ea5e9', '#22c55e'],
    accept: ['pdf'],
    action: 'Unlock',
    fields: [{ key: 'password', label: 'Current password', type: 'password', placeholder: 'Leave empty if it only has edit restrictions' }],
    defaults: { password: '' }
  },
  {
    id: 'office-to-pdf',
    name: 'Office to PDF',
    tagline: 'Word, Excel and PowerPoint to PDF.',
    category: 'office',
    icon: FileText,
    colors: ['#3b82f6', '#22d3ee'],
    accept: OFFICE_IN,
    action: 'Convert to PDF',
    fields: [OFFICE_ENGINE],
    defaults: { engine: 'auto' }
  },
  {
    id: 'pdf-to-word',
    name: 'PDF to Word',
    tagline: 'Turn a PDF into an editable .docx.',
    category: 'office',
    icon: FileType2,
    colors: ['#2563eb', '#a855f7'],
    accept: ['pdf'],
    action: 'Convert to Word',
    fields: [OFFICE_ENGINE],
    defaults: { engine: 'auto' }
  }
]

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'image', name: 'Images' },
  { id: 'pdf', name: 'PDF' },
  { id: 'office', name: 'Office' }
]

export const toolById = (id: ToolId): ToolDef => TOOLS.find((t) => t.id === id)!
