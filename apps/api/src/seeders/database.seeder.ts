/* eslint-disable no-console */

import { Dictionary, EntityManager } from '@mikro-orm/core'
import { Seeder } from '@mikro-orm/seeder'
import { CommentSeeder } from '../modules/example/comments/comment.seeder'
import { PostSeeder } from '../modules/example/posts/post.seeder'
import { AuthSeeder } from './auth.seeder'
import { DemoSeeder } from './demo.seeder'
import { EbioSeeder } from './ebio.seeder'
import { RbacSeeder } from './rbac.seeder'

export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const context: Dictionary = {}

    // Run AuthSeeder first to create users
    await new AuthSeeder().run(em, context)
    console.info('AuthSeeder done')

    // Run RBAC seeder for roles and permissions
    await new RbacSeeder().run(em, context)
    console.info('RbacSeeder done')

    // Run eBio seeder for categories, plans, commissions
    await new EbioSeeder().run(em, context)
    console.info('EbioSeeder done')

    // Run demo seeder for complete test data
    await new DemoSeeder().run(em, context)
    console.info('DemoSeeder done')

    // Run PostSeeder to create posts
    await new PostSeeder().run(em, context)
    console.info('PostSeeder done')

    // Run CommentSeeder to create comments
    await new CommentSeeder().run(em, context)
    console.info('CommentSeeder done')
  }
}
