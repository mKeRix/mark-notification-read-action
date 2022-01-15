import * as core from '@actions/core'
import * as github from '@actions/github'

async function run(): Promise<void> {
  try {
    const dryRun: boolean = core.getInput('dry-run') === 'true'
    const token: string = core.getInput('token')
    const octokit = github.getOctokit(token, {
      log: {
        debug: core.debug,
        info: core.info,
        warn: core.warning,
        error: core.error
      }
    })

    const getNotificationDetails = async (
      subjectUrl: string
    ): Promise<NotificationDetails> => {
      const result = await octokit.request(`GET ${subjectUrl}`)
      return {
        author: result.data.user.login,
        state: result.data.state
      }
    }

    const filteredUsers = inputToArray(core.getInput('user-filter'))
    const filteredStates = inputToArray(core.getInput('state-filter'))
    const filteredReasons = inputToArray(core.getInput('reason-filter'))

    for await (const response of octokit.paginate.iterator(
      octokit.rest.activity.listNotificationsForAuthenticatedUser,
      {
        per_page: 100
      }
    )) {
      core.debug(`Found ${response.data.length} notification(s)`)

      for (const notification of response.data.values()) {
        if (!filterIncludesOrEmpty(filteredReasons, notification.reason)) {
          core.debug(
            `Skipping "${notification.subject.title}" as it does not match the reason filter (reason: ${notification.reason})`
          )
          continue
        }

        if (['Issue', 'PullRequest'].includes(notification.subject.type)) {
          if (notification.subject.url == null) {
            core.debug(
              `Skipping "${notification.subject.title}" as it does not have a subject URL`
            )
            continue
          }

          const notificationDetails = await getNotificationDetails(
            notification.subject.url
          )
          if (
            !filterIncludesOrEmpty(filteredUsers, notificationDetails.author)
          ) {
            core.debug(
              `Skipping "${notification.subject.title}" as it does not match the user filter (author: ${notificationDetails.author})`
            )
            continue
          }

          if (
            !filterIncludesOrEmpty(filteredStates, notificationDetails.state)
          ) {
            core.debug(
              `Skipping "${notification.subject.title}" as it does not match the state filter (state: ${notificationDetails.state})`
            )
            continue
          }
        } else {
          core.debug(
            `Skipping "${notification.subject.title}" as it is not an issue or pull request (type: ${notification.subject.type})`
          )
          continue
        }

        core.info(`Marking "${notification.subject.title}" as read`)
        if (!dryRun) {
          octokit.rest.activity.markThreadAsRead({
            thread_id: parseInt(notification.id, 10)
          })
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

function inputToArray(input: string): string[] {
  return input.length === 0 ? [] : input.split(',')
}

function filterIncludesOrEmpty(filter: string[], value: string): boolean {
  return filter.length === 0 || filter.includes(value)
}

interface NotificationDetails {
  author: string
  state: string
}

run()
