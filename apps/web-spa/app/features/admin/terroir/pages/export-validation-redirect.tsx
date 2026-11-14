import { Navigate } from 'react-router'

/** The former manual validation queue now lives at « Contrôle export »; old links land there. */
export default function ExportValidationRedirect() {
  return <Navigate to="/admin/terroir/controle" replace />
}
