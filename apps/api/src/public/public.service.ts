import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { App as PApp, User as PUser } from '@prisma/client';
import {
  GeneratedFile,
  MakerProfile,
  Paginated,
  PublicApp,
  slugify,
  Track,
} from '@larkwave/shared';
import { PrismaService } from '../prisma/prisma.service';
import { BuildsService } from '../builds/builds.service';
import type { AuthUser } from '../common/auth-user';
import { Prisma } from '@prisma/client';

type Row = PApp & { owner?: Pick<PUser, 'name' | 'email' | 'handle'> | null };
const OWNER_SELECT = { name: true, email: true, handle: true } as const;

function toPublic(a: Row): PublicApp {
  const author =
    a.owner?.name?.trim() || a.owner?.email?.split('@')[0] || 'Người dùng';
  return {
    slug: a.slug,
    name: a.name,
    description: a.description,
    track: a.track as Track,
    url: a.currentUrl ?? null,
    visits: a.visits ?? 0,
    author,
    authorHandle: a.owner?.handle ?? null,
    updatedAt: a.updatedAt.toISOString(),
  };
}

/**
 * Public showcase — anyone (no auth) can browse published apps and open them.
 * Only the public-safe fields are exposed (never owner/email/internal ids).
 */
@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly builds: BuildsService,
  ) {}

  /** A short, unique 6-char app slug from a base name. */
  private async uniqueSlug(base: string): Promise<string> {
    const root = slugify(base) || 'app';
    for (let i = 0; i < 6; i += 1) {
      const slug = i === 0 ? root : `${root}-${randomBytes(2).toString('hex')}`;
      const exists = await this.prisma.app.findUnique({ where: { slug }, select: { id: true } });
      if (!exists) return slug;
    }
    return `${root}-${randomBytes(4).toString('hex')}`;
  }

  /**
   * REMIX/FORK: clone a published app's latest build into a NEW app owned by the
   * current user (editable). Increments the source's remix counter. The clone
   * deploy is free (skipCredits) — friction-free forking drives the creation loop;
   * the user spends credits only when they iterate. Returns the new app + build.
   */
  async remix(user: AuthUser, slug: string): Promise<{ appId: string; buildId: string }> {
    const src = await this.prisma.app.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        track: true,
        backendKind: true,
        cms: true,
        published: true,
      },
    });
    if (!src || !src.published) {
      throw new NotFoundException('App không tồn tại hoặc chưa được công khai');
    }
    const latest = await this.prisma.build.findFirst({
      // `files: { not: undefined }` là NO-OP của Prisma (bị bỏ qua). Từ khi người dùng xoá được
      // mã nguồn bản dựng cũ, lọc hỏng nghĩa là có thể chọn trúng một build ĐÃ BỊ DỌN → `?? []` →
      // pipeline tưởng app chưa có code và sinh lại từ đầu.
      where: { appId: src.id, status: 'succeeded', NOT: { files: { equals: Prisma.DbNull } } },
      orderBy: { createdAt: 'desc' },
      select: { files: true },
    });
    const files = (latest?.files as unknown as GeneratedFile[]) ?? [];
    if (!files.length) {
      throw new BadRequestException('App này chưa có bản dựng để remix.');
    }
    const app = await this.prisma.app.create({
      data: {
        ownerId: user.id,
        name: `${src.name} (remix)`,
        slug: await this.uniqueSlug(src.name),
        track: src.track,
        backendKind: src.backendKind,
        cms: src.cms,
        status: 'draft',
        remixedFromId: src.id,
      },
    });
    await this.prisma.app.update({
      where: { id: src.id },
      data: { remixCount: { increment: 1 } },
    });
    // Clone-deploy via the EDIT pipeline (no codegen), free of charge.
    const { buildId } = await this.builds.create(
      user,
      { appId: app.id, prompt: `Remix ${src.name}`, track: src.track as Track, files },
      { skipCredits: true },
    );
    return { appId: app.id, buildId };
  }

  async list(query: {
    page?: number;
    pageSize?: number;
    q?: string;
    track?: string;
  }): Promise<Paginated<PublicApp>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 24), 60);
    const where = {
      published: true,
      ...(query.track ? { track: query.track as Track } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { description: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.app.findMany({
        where,
        orderBy: [{ visits: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { owner: { select: OWNER_SELECT } },
      }),
      this.prisma.app.count({ where }),
    ]);
    return { items: rows.map(toPublic), total, page, pageSize };
  }

  async get(slug: string): Promise<PublicApp> {
    const a = await this.prisma.app.findUnique({
      where: { slug },
      include: { owner: { select: OWNER_SELECT } },
    });
    if (!a || !a.published) {
      throw new NotFoundException('App không tồn tại hoặc chưa được công khai');
    }
    return toPublic(a);
  }

  /** Increment the public-page visit counter. Returns the new total. */
  async visit(slug: string): Promise<{ visits: number }> {
    const a = await this.prisma.app.findUnique({
      where: { slug },
      select: { id: true, published: true },
    });
    if (!a || !a.published) {
      throw new NotFoundException('App không tồn tại hoặc chưa được công khai');
    }
    const updated = await this.prisma.app.update({
      where: { id: a.id },
      data: { visits: { increment: 1 } },
      select: { visits: true },
    });
    return { visits: updated.visits };
  }

  /** Public maker profile: the maker + their published apps + follower counts. */
  async maker(handle: string): Promise<MakerProfile> {
    const u = await this.prisma.user.findFirst({
      where: { handle },
      select: { id: true, name: true, email: true, avatarUrl: true, handle: true, createdAt: true },
    });
    if (!u || !u.handle) throw new NotFoundException('Không tìm thấy maker');
    const [apps, followers, following, appCount] = await Promise.all([
      this.prisma.app.findMany({
        where: { ownerId: u.id, published: true },
        orderBy: [{ visits: 'desc' }, { updatedAt: 'desc' }],
        take: 24,
        include: { owner: { select: OWNER_SELECT } },
      }),
      this.prisma.follow.count({ where: { followingId: u.id } }),
      this.prisma.follow.count({ where: { followerId: u.id } }),
      this.prisma.app.count({ where: { ownerId: u.id, published: true } }),
    ]);
    return {
      handle: u.handle,
      name: u.name?.trim() || u.email.split('@')[0],
      avatarUrl: u.avatarUrl ?? null,
      apps: apps.map(toPublic),
      followers,
      following,
      appCount,
      joinedAt: u.createdAt.toISOString(),
    };
  }
}
