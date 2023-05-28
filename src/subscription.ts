import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

const catFilters = [/\b(cat(s*|z*)?|kitt(en|ens|y|ies))\b/gi]

function matchInText(text: string, filters: (string | RegExp)[]) {
  let found = false;

  filters.forEach(filter => {
    if (typeof filter === 'string') {
      if (text.includes(filter)) {
        found = true;
      }
    } else if (filter instanceof RegExp) {
      if (filter.test(text)) {
        found = true;
      }
    }
  });

  return found;
}

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => matchInText(create.record.text, catFilters))
      .map((create) => {
        // map posts to a db row
        return {
          uri: create.uri,
          cid: create.cid,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
