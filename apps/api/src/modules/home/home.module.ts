import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { SearchModule } from '../search/search.module'
import { HomeSection } from './home-section.entity'
import { AdminHomeSectionsController, HomeController } from './home-sections.controller'
import { HomeSectionsService } from './home-sections.service'

/**
 * The home sections.
 *
 * No domain logic here: a section is a saved search, and `SearchModule` is
 * what knows how to search.
 */
@Module({
  imports: [MikroOrmModule.forFeature([HomeSection]), SearchModule],
  controllers: [HomeController, AdminHomeSectionsController],
  providers: [HomeSectionsService],
  exports: [HomeSectionsService],
})
export class HomeModule {}
