import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

// Firebase configuration - nahraďte vaší konfigurací z Firebase Console
const firebaseConfig = {
  apiKey: "VÁŠ_API_KLÍČ_ZDE",
  authDomain: "váš-projekt.firebaseapp.com",
  projectId: "váš-projekt-id",
  storageBucket: "váš-projekt.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789012345678"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Types
export interface CachedExplanation {
  explanation: string;
  detailedExplanation?: string;
  provider: 'gemini' | 'claude';
  model: string;
  usageCount: number;
  createdAt: Timestamp;
  lastUsed: Timestamp;
}

export interface CachedObjective {
  objective: string;
  confidence: number;
  createdAt: Timestamp;
}

// Cache service functions
export class FirebaseCacheService {
  private static instance: FirebaseCacheService;
  
  static getInstance(): FirebaseCacheService {
    if (!FirebaseCacheService.instance) {
      FirebaseCacheService.instance = new FirebaseCacheService();
    }
    return FirebaseCacheService.instance;
  }

  // Get cached explanation
  async getCachedExplanation(questionId: string, model: string): Promise<CachedExplanation | null> {
    try {
      const docRef = doc(db, 'explanations', `${questionId}_${model}`);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data() as CachedExplanation;
        // Update usage count
        await updateDoc(docRef, {
          usageCount: data.usageCount + 1,
          lastUsed: serverTimestamp()
        });
        return data;
      }
      return null;
    } catch (error) {
      console.error('Error fetching cached explanation:', error);
      return null;
    }
  }

  // Save explanation to cache
  async saveExplanation(
    questionId: string, 
    explanation: string, 
    detailedExplanation: string | null,
    provider: 'gemini' | 'claude',
    model: string
  ): Promise<void> {
    try {
      const docRef = doc(db, 'explanations', `${questionId}_${model}`);
      const data: CachedExplanation = {
        explanation,
        detailedExplanation: detailedExplanation || undefined,
        provider,
        model,
        usageCount: 1,
        createdAt: serverTimestamp(),
        lastUsed: serverTimestamp()
      };
      
      await setDoc(docRef, data, { merge: true });
      console.log('Explanation saved to Firebase cache');
    } catch (error) {
      console.error('Error saving explanation to cache:', error);
    }
  }

  // Get cached objective
  async getCachedObjective(questionId: string): Promise<CachedObjective | null> {
    try {
      const docRef = doc(db, 'objectives', questionId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return docSnap.data() as CachedObjective;
      }
      return null;
    } catch (error) {
      console.error('Error fetching cached objective:', error);
      return null;
    }
  }

  // Save objective to cache
  async saveObjective(questionId: string, objective: string, confidence: number = 0.8): Promise<void> {
    try {
      const docRef = doc(db, 'objectives', questionId);
      const data: CachedObjective = {
        objective,
        confidence,
        createdAt: serverTimestamp()
      };
      
      await setDoc(docRef, data, { merge: true });
      console.log('Objective saved to Firebase cache');
    } catch (error) {
      console.error('Error saving objective to cache:', error);
    }
  }

  // Get cache statistics
  async getCacheStats(): Promise<{ explanations: number; objectives: number; totalUsage: number }> {
    try {
      // This would require a more complex query in production
      // For now, return placeholder data
      return {
        explanations: 0,
        objectives: 0,
        totalUsage: 0
      };
    } catch (error) {
      console.error('Error fetching cache stats:', error);
      return { explanations: 0, objectives: 0, totalUsage: 0 };
    }
  }
}

export default FirebaseCacheService.getInstance();
