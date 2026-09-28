import { motion } from 'framer-motion'

/** Slowly drifting colour blobs behind everything; they take on the active tool's colours. */
export default function Background({ colors }: { colors: [string, string] }): React.JSX.Element {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-[10%] -top-[20%] h-[70vh] w-[70vh] rounded-full opacity-40 blur-[120px] animate-blob"
        animate={{ backgroundColor: colors[0] }}
        transition={{ duration: 1.2 }}
      />
      <motion.div
        className="absolute -right-[10%] top-[10%] h-[60vh] w-[60vh] rounded-full opacity-30 blur-[120px] animate-blob [animation-delay:-7s]"
        animate={{ backgroundColor: colors[1] }}
        transition={{ duration: 1.2 }}
      />
      <div className="absolute bottom-[-30%] left-[30%] h-[60vh] w-[60vh] rounded-full bg-blue-700 opacity-25 blur-[140px] animate-blob [animation-delay:-14s]" />
      <div className="grid-bg absolute inset-0" />
      <div className="grain absolute inset-0" />
    </div>
  )
}
