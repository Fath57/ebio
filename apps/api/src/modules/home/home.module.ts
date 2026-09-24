import { MikroOrmModule } from '@mikro-orm/nestjs'
import { Module } from '@nestjs/common'
import { SearchModule } from '../search/search.module'
import { HomeSection } from './home-section.entity'
import { AdminHomeSectionsController, HomeController } from './home-sections.controller'
import { HomeSectionsService } from './home-sections.service'

/**
 * Les sections de l'accueil.
 *
 * Rien de métier ici : une section est une recherche enregistrée, et c'est
 * `SearchModule` qui sait chercher.
 */
@Module({
  imports: [MikroOrmModule.forFeature([HomeSection]), SearchModule],
  controllers: [HomeController, AdminHomeSectionsController],
  providers: [HomeSectionsService],
  exports: [HomeSectionsService],
})
export class HomeModule {}
