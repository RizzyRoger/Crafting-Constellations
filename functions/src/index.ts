import { setGlobalOptions } from 'firebase-functions/v2'

setGlobalOptions({ region: 'us-central1', maxInstances: 10 })

export { saveProfile } from './profile.js'
export { moderatePost, moderateComment, moderateGroupMessage, moderateDm, moderateChatMessage } from './content.js'
export { countMembers, countLikes, countComments } from './counters.js'
export { onReportCreated } from './reports.js'
export { mirrorFriendship } from './friendships.js'
export { createChat } from './chats.js'
export {
  approveContent,
  removeContent,
  banUser,
  unbanUser,
  reviewProfessional,
  setAdmin,
  bootstrapAdmin,
  createGroup,
} from './admin.js'
