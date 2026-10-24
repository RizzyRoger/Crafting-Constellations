import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet, RouterProvider, type RouteObject } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { Gate } from './auth/Gate'
import { ConsentNote } from './components/ConsentNote'
import { PageViews } from './components/PageViews'
import { PencilDefs } from './components/PencilDefs'
import { Quiet } from './components/Quiet'
import { RouteError } from './components/RouteError'
import { Shell } from './components/Shell'
import { loadPage } from './lib/release'
import { AdminClaim } from './pages/AdminClaim'
import { Chat } from './pages/Chat'
import { Constellation } from './pages/Constellation'
import { DeleteAccount } from './pages/DeleteAccount'
import { Group } from './pages/Group'
import { Landing } from './pages/Landing'
import { Me } from './pages/Me'
import { Messages } from './pages/Messages'
import { NewChat } from './pages/NewChat'
import { NotFound } from './pages/NotFound'
import { Notifications } from './pages/Notifications'
import { Onboarding } from './pages/Onboarding'
import { PostPage } from './pages/Post'
import { Professional } from './pages/Professional'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'
import { Thread } from './pages/Thread'
import { Verify } from './pages/Verify'

// Moderators only: kept out of everyone else's first download. A tab opened before a deploy
// asks for the old file, so it reloads once for the new release
const Admin = lazy(() => loadPage(() => import('./pages/Admin')).then((m) => ({ default: m.Admin })))

const Root = () => (
  <AuthProvider>
    <PencilDefs />
    <PageViews routes={routes} />
    <Outlet />
    <ConsentNote />
  </AuthProvider>
)

// Signed-in pages with a profile live inside the rail shell
const Inside = () => (
  <Gate need="profile">
    <Shell>
      <Outlet />
    </Shell>
  </Gate>
)

export const routes: RouteObject[] = [
  {
    element: <Root />,
    // Anything that fails outside the rail (sign-in, the shell itself)
    errorElement: <RouteError alone />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/signin', element: <SignIn /> },
      { path: '/signup', element: <SignUp /> },
      { path: '/verify', element: <Gate need="signedIn"><Verify /></Gate> },
      { path: '/onboarding', element: <Gate need="signedIn"><Onboarding /></Gate> },
      // Outside the profile gate: the profile disappears partway through deleting
      { path: '/delete-account', element: <Gate need="signedIn"><DeleteAccount /></Gate> },
      {
        element: <Inside />,
        children: [
          {
            // A page that fails (code gone after a deploy, an address that can't be read) keeps the rail
            errorElement: <RouteError />,
            children: [
              { path: '/constellation', element: <Constellation /> },
              { path: '/groups/:groupId', element: <Group /> },
              { path: '/groups/:groupId/posts/:postId', element: <PostPage /> },
              { path: '/messages', element: <Messages /> },
              { path: '/messages/:pairId', element: <Thread /> },
              { path: '/chats/new', element: <NewChat /> },
              { path: '/chats/:chatId', element: <Chat /> },
              { path: '/me', element: <Me /> },
              { path: '/notifications', element: <Notifications /> },
              { path: '/professional', element: <Professional /> },
              { path: '/admin/claim', element: <AdminClaim /> },
              {
                path: '/admin',
                element: (
                  <Gate need="admin">
                    <Suspense fallback={<Quiet>Opening the review sheet…</Quiet>}>
                      <Admin />
                    </Suspense>
                  </Gate>
                ),
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]

const router = createBrowserRouter(routes)

export const App = () => <RouterProvider router={router} />
