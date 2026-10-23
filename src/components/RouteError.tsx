import { Link } from 'react-router-dom'
import { AuthLayout } from '../pages/AuthLayout'
import { PencilDefs } from './PencilDefs'
import { Quiet } from './Quiet'

// A fresh load brings this release's code; a tab opened before a deploy asks for files that are gone
const reload = () => window.location.reload()

// In place of a page that failed to draw (its code went with a release, or its address can't be
// read), never the router's developer screen. In the rail it keeps the rail. Alone it stands in for
// the whole app, sign-in included, so it reads nothing from it.
export const RouteError = ({ alone = false }: { alone?: boolean }) => {
  if (!alone) {
    return (
      <Quiet>
        This page didn’t open.{' '}
        <button type="button" className="link-btn" onClick={reload}>
          Reload
        </button>
      </Quiet>
    )
  }
  return (
    <>
      <PencilDefs />
      <AuthLayout title="This page didn’t open" lede="Reloading usually brings it back.">
        <div className="row">
          <button type="button" className="act act--wash" onClick={reload}>
            Reload
          </button>
          <Link to="/" className="act">
            Back to the front
          </Link>
        </div>
      </AuthLayout>
    </>
  )
}
