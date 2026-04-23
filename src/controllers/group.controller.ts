import type { Request, Response } from 'express';
import { db } from '../config/firebase';
import type { GroupDocument } from '../types/models';
import { ApiError } from '../utils/api-error';
import { getString, requireUser } from '../utils/request';

const normalizeGroup = (id: string, data: any): GroupDocument => ({
  id,
  name: data.name || '',
  description: data.description || '',
  ownerId: data.ownerId || '',
  members: data.members || [],
  memberIds: data.memberIds || [],
  memberProfiles: data.memberProfiles || {},
  memberCount: data.memberCount || 0,
  blockedMembers: data.blockedMembers || [],
  blockedMemberIds: data.blockedMemberIds || [],
  visibility: data.visibility || 'Private',
  tags: data.tags || [],
  rules: data.rules || [],
  coverImage: data.coverImage || null,
  createdAt: data.createdAt || new Date().toISOString(),
});

export const getGroups = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireUser(req);
    const memberSnap = await db.collection('groups').where('memberIds', 'array-contains', user.uid).get();
    const ownerSnap = await db.collection('groups').where('ownerId', '==', user.uid).get();

    const allGroups = [...memberSnap.docs, ...ownerSnap.docs].map(d => normalizeGroup(d.id, d.data()));
    
    // Deduplicate
    const deduped = Array.from(new Map(allGroups.map(g => [g.id, g])).values());

    res.status(200).json(deduped);
  } catch (error: unknown) {
    res.status(500).json({ message: 'Failed to fetch groups' });
  }
};

export const getGroupById = async (req: Request, res: Response): Promise<void> => {
  try {
    const groupId = getString(req.params.groupId, 'groupId');
    const doc = await db.collection('groups').doc(groupId).get();
    if (!doc.exists) throw new ApiError(404, 'Group not found');
    res.status(200).json(normalizeGroup(doc.id, doc.data()));
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to fetch group' });
  }
};

export const createGroup = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireUser(req);
    const body = req.body as Partial<GroupDocument>;
    
    const userDoc = await db.collection('users').doc(user.uid).get();
    const currentName = String(userDoc.data()?.name || 'User');
    const currentAvatar = String(userDoc.data()?.photo_url || currentName.charAt(0));

    const newGroup = {
      ...body,
      ownerId: user.uid,
      visibility: 'Private',
      members: [currentName],
      memberIds: [user.uid],
      memberProfiles: {
        [user.uid]: {
          name: currentName,
          avatar: currentAvatar,
          email: user.email || '',
          role: 'Owner',
        },
      },
      memberCount: 1,
      blockedMembers: [],
      blockedMemberIds: [],
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection('groups').add(newGroup);
    res.status(201).json(normalizeGroup(docRef.id, newGroup));
  } catch (error: unknown) {
    res.status(500).json({ message: 'Failed to create group' });
  }
};

export const updateGroup = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireUser(req);
    const groupId = getString(req.params.groupId, 'groupId');
    const updates = req.body;
    
    const docRef = db.collection('groups').doc(groupId);
    const snap = await docRef.get();
    if (!snap.exists) throw new ApiError(404, 'Group not found');
    
    const group = snap.data() as GroupDocument;
    if (group.ownerId !== user.uid) {
      throw new ApiError(403, 'Only the group owner can update this group');
    }

    const sanitizedUpdates = { ...updates, visibility: 'Private' };
    await docRef.set(sanitizedUpdates, { merge: true });

    res.status(200).json(normalizeGroup(docRef.id, { ...group, ...sanitizedUpdates }));
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to update group' });
  }
};

export const deleteGroup = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = requireUser(req);
    const groupId = getString(req.params.groupId, 'groupId');
    
    const docRef = db.collection('groups').doc(groupId);
    const snap = await docRef.get();
    if (!snap.exists) throw new ApiError(404, 'Group not found');
    
    const group = snap.data() as GroupDocument;
    if (group.ownerId !== user.uid) {
      throw new ApiError(403, 'Only the group owner can delete this group');
    }

    await docRef.delete();
    res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      res.status(error.statusCode).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: 'Failed to delete group' });
  }
};
