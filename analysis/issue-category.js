'use strict'

function issueCategory (issues) {
  const memoryIssue = (issues.memory.external || issues.memory.rss ||
                       issues.memory.heapTotal || issues.memory.heapUsed)

  let category = 'unknown'

  if (memoryIssue && !issues.cpu && !issues.handles) {
    category = 'gc'
  } else if (!memoryIssue && issues.delay && !issues.cpu && !issues.handles) {
    category = 'event-loop'
  } else if (!memoryIssue && !issues.delay && (issues.cpu || issues.handles)) {
    category = 'io'
  } else if (!memoryIssue && !issues.delay && !issues.cpu && !issues.handles) {
    category = 'none'
  }

  return category
}
module.exports = issueCategory
