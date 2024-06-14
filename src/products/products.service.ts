import { rm } from 'fs/promises';

import { Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { omit } from 'lodash';

import { CreateProductDto } from './dtos/create-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { RecordNotFoundError } from 'src/core/errors/record-not-found.error';
import { UniqueConstraintError } from 'src/core/errors/unique-constraint.error';
import { PrismaService } from 'src/core/services/prisma.service';
import { slugify } from 'src/core/utils/slugify';
import { FindAllQueryDto } from './dtos/find-all-query.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  findById(productId: number) {
    return this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        categories: true,
      },
    });
  }

  findBySlug(slug: string) {
    return this.prisma.product.findUnique({
      where: { slug },
      include: {
        categories: true,
      },
    });
  }

  findByIdOrSlug(idOrSlug: string) {
    if (isNaN(+idOrSlug)) return this.findBySlug(idOrSlug);
    return this.findById(+idOrSlug);
  }

  async findAll(options: FindAllQueryDto = {}) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 10;
    const totalCount = await this.prisma.product.count();
    const products = await this.prisma.product.findMany({
      include: {
        categories: true,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return {
      meta: {
        page,
        limit,
        previousPage: page === 1 ? undefined : page - 1,
        nextPage: Math.ceil(totalCount / limit) > page ? page + 1 : undefined,
        totalCount,
      },
      items: products,
    };
  }

  async create(form: CreateProductDto, filepath: string) {
    try {
      return await this.prisma.product.create({
        data: {
          ...omit(form, 'categoryIds'),
          slug: form.name ? slugify(form.name) : undefined,
          image: filepath,
          categories: { connect: form.categoryIds.map((id) => ({ id })) },
        },
      });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new UniqueConstraintError(e.meta.target);
      }
    }
  }

  async update(productId: number, form: UpdateProductDto, filepath?: string) {
    try {
      console.log(productId, form, filepath);
      await this.removeImage(productId);

      return await this.prisma.product.update({
        where: { id: productId },
        data: {
          ...omit(form, 'categoryIds'),
          slug: form.name ? slugify(form.name) : undefined,
          image: filepath ?? undefined,
          categories: form.categoryIds
            ? { connect: form.categoryIds.map((id) => ({ id })) }
            : undefined,
        },
      });
    } catch (e) {
      console.log(e);
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new RecordNotFoundError();
      }
    }
  }

  async destroy(productId: number) {
    try {
      return await this.prisma.product.delete({ where: { id: productId } });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new RecordNotFoundError();
      }
    }
  }

  private async removeImage(productId: number) {
    const existingProduct = await this.findById(productId);

    if (existingProduct.image) await rm(existingProduct.image, { force: true });
  }
}
