import dynamic from 'next/dynamic'

const EditingToolsClient = dynamic(() => import('./EditingToolsClient'), { ssr: false })

export default function EditingToolsPage() {
  return <EditingToolsClient />
}
