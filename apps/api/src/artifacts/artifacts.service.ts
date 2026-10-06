import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ARTIFACT_KINDS,
  type ArtifactDto,
  type PublicArtifactDto,
  type CreateArtifactDto,
  type UpdateArtifactDto,
} from './artifacts.dto';

type RawArtifact = {
  id: string;
  title: string;
  kind: string;
  language: string;
  content: string;
  visibility: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
};

const SELECT = {
  id: true,
  title: true,
  kind: true,
  language: true,
  content: true,
  visibility: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toDto(a: RawArtifact): ArtifactDto {
  return {
    id: a.id,
    title: a.title,
    kind: a.kind,
    language: a.language,
    content: a.content,
    visibility: a.visibility,
    slug: a.slug,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function normKind(kind?: string): string {
  return kind && (ARTIFACT_KINDS as readonly string[]).includes(kind) ? kind : 'html';
}

@Injectable()
export class ArtifactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<ArtifactDto[]> {
    const rows = await this.prisma.artifact.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: SELECT,
    });
    return rows.map(toDto);
  }

  async get(userId: string, id: string): Promise<ArtifactDto> {
    const a = await this.prisma.artifact.findFirst({ where: { id, userId }, select: SELECT });
    if (!a) throw new NotFoundException('Artifact không tồn tại');
    return toDto(a);
  }

  async create(userId: string, dto: CreateArtifactDto): Promise<ArtifactDto> {
    const a = await this.prisma.artifact.create({
      data: {
        userId,
        title: dto.title.trim().slice(0, 160) || 'Artifact',
        kind: normKind(dto.kind),
        language: (dto.language ?? '').slice(0, 40),
        content: dto.content ?? '',
        visibility: dto.visibility === 'public' ? 'public' : 'private',
        slug: randomBytes(6).toString('hex'),
      },
      select: SELECT,
    });
    return toDto(a);
  }

  async update(userId: string, id: string, patch: UpdateArtifactDto): Promise<ArtifactDto> {
    const owned = await this.prisma.artifact.findFirst({ where: { id, userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Artifact không tồn tại');
    const a = await this.prisma.artifact.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 160) || 'Artifact' } : {}),
        ...(patch.kind !== undefined ? { kind: normKind(patch.kind) } : {}),
        ...(patch.language !== undefined ? { language: patch.language.slice(0, 40) } : {}),
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        ...(patch.visibility !== undefined ? { visibility: patch.visibility === 'public' ? 'public' : 'private' } : {}),
      },
      select: SELECT,
    });
    return toDto(a);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.prisma.artifact.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** Public view by slug (no auth) — only when visibility=public. */
  async getPublic(slug: string): Promise<PublicArtifactDto> {
    const a = await this.prisma.artifact.findFirst({
      where: { slug, visibility: 'public' },
      select: { title: true, kind: true, language: true, content: true, updatedAt: true },
    });
    if (!a) throw new NotFoundException('Không tìm thấy artifact công khai');
    return {
      title: a.title,
      kind: a.kind,
      language: a.language,
      content: a.content,
      updatedAt: a.updatedAt.toISOString(),
    };
  }
}
